using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Approvals;

/// <summary>
/// Real-time approval routing. Every hop goes through the manager:
/// <list type="number">
/// <item>Mechanic submits a repair proposal → managers are notified.</item>
/// <item>Manager forwards it to the customer (or returns it to the mechanic).</item>
/// <item>Customer approves / rejects each item → managers are notified (the mechanic is not).</item>
/// <item>Manager releases the approved items → the mechanic is notified and may start, the customer gets confirmation.</item>
/// </list>
/// </summary>
public sealed class ApprovalWorkflowService(
    IManagerDb db,
    WorkshopReadModel read,
    INotificationService notifier,
    QueueService queue,
    InventoryService inventory,
    IClock clock)
{
    /// <summary>Price increase above this fraction after approval needs renewed customer approval.</summary>
    public const decimal RevisionTolerance = 0.10m;

    // ---------------------------------------------------------------- 1. Mechanic → Manager
    public async Task<ProposalDto> SubmitAsync(Guid mechanicId, Guid jobId, SubmitProposalRequest req, CancellationToken ct = default)
    {
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId && j.MechanicId == mechanicId, ct)
                  ?? throw new NotFoundException("Job");
        if (!job.IsActive) throw new ConflictException("job_closed", "This job is already finished.");
        var open = await db.Proposals.AnyAsync(p => p.JobCardId == jobId &&
            (p.Status == ProposalStatus.PendingManagerReview || p.Status == ProposalStatus.AwaitingCustomer || p.Status == ProposalStatus.CustomerResponded), ct);
        if (open) throw new ConflictException("proposal_open", "A proposal for this job is still waiting for a decision.");

        var items = req.Items.Select(i => new RepairItem
        {
            Title = i.Title.Trim(),
            Kind = Enum.TryParse<RepairItemKind>(i.Kind, true, out var k) ? k : RepairItemKind.Part,
            Qty = i.Qty,
            UnitPrice = i.UnitPrice,
            LinkedIssueId = i.LinkedIssueId,
            PartId = i.PartId,
        });
        var now = clock.UtcNow;
        var proposal = RepairProposal.Submit(jobId, mechanicId, req.Note, items, now);
        proposal.ReportVersion = await db.Proposals.CountAsync(p => p.JobCardId == jobId, ct) + 1;
        db.Proposals.Add(proposal);
        job.Status = JobStatus.AwaitingManagerReview;
        Audit(proposal, Roles.Mechanic, mechanicId, "Submitted to manager", $"{proposal.Items.Count} item(s) · Rs {proposal.Total:N0}");
        await db.SaveChangesAsync(ct);

        var mechanicName = await read.MechanicNameAsync(mechanicId, ct) ?? "Mechanic";
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ProposalSubmitted,
                "Repair proposal needs your review",
                $"{mechanicName} proposed {proposal.Items.Count} item(s) for {job.Number} · {job.VehicleLabel} · Rs {proposal.Total:N0}",
                "proposal", proposal.Id, job.Id),
            new[] { Recipient.AllStaff() }, ct);

        await PublishAsync(proposal.Id, job, toMechanic: true, toCustomer: false, ct);
        return await read.ProposalAsync(proposal.Id, maskForMechanic: true, ct);
    }

    // ---------------------------------------------------------------- 2a. Manager adjusts price before forwarding
    public async Task<ProposalDto> SetItemPriceAsync(Guid staffId, Guid proposalId, Guid itemId, decimal unitPrice, int qty, CancellationToken ct = default)
    {
        var (p, job) = await LoadAsync(proposalId, ct);
        p.SetPriceBeforeForward(itemId, unitPrice, qty);
        Audit(p, Roles.Manager, staffId, "Price set", $"{p.Items.First(i => i.Id == itemId).Title}: {qty} × Rs {unitPrice:N0}");
        await db.SaveChangesAsync(ct);
        await PublishAsync(p.Id, job, toMechanic: false, toCustomer: false, ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    // ---------------------------------------------------------------- 2b. Manager → Customer
    public async Task<ProposalDto> ForwardToCustomerAsync(Guid staffId, Guid proposalId, string? note, CancellationToken ct = default)
    {
        var (p, job) = await LoadAsync(proposalId, ct);
        var now = clock.UtcNow;
        p.ForwardToCustomer(staffId, note, now);
        job.Status = JobStatus.AwaitingCustomerApproval;

        // FixProof: the verified findings of this job become visible with the forwarded proposal.
        var issues = await db.Issues.Where(i => i.JobCardId == job.Id && !i.PublishedToCustomer).ToListAsync(ct);
        foreach (var i in issues) { i.PublishedToCustomer = true; i.ReportVersion = p.ReportVersion; }

        Audit(p, Roles.Manager, staffId, "Sent to customer", note);
        await db.SaveChangesAsync(ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ApprovalRequested,
                $"Approval needed · {job.VehicleLabel}",
                $"{p.Items.Count} repair item(s) · Rs {p.Total:N0}. Open the FixProof report and approve item by item.",
                "proposal", p.Id, job.Id,
                new Dictionary<string, string> { ["route"] = "approval", ["proposalId"] = p.Id.ToString() }),
            new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ProposalForwarded,
                "Manager sent your proposal to the customer",
                $"{job.Number}: waiting for the customer's decision. Do not start these items yet.",
                "proposal", p.Id, job.Id),
            new[] { Recipient.User(Roles.Mechanic, p.MechanicId) }, ct);

        await PublishAsync(p.Id, job, toMechanic: true, toCustomer: true, ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    // ---------------------------------------------------------------- 2c. Manager → Mechanic (return)
    public async Task<ProposalDto> ReturnToMechanicAsync(Guid staffId, Guid proposalId, string note, CancellationToken ct = default)
    {
        var (p, job) = await LoadAsync(proposalId, ct);
        p.ReturnToMechanic(staffId, note, clock.UtcNow);
        job.Status = JobStatus.Inspecting;
        Audit(p, Roles.Manager, staffId, "Returned to mechanic", note);
        await db.SaveChangesAsync(ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ProposalReturned,
                "Proposal returned by manager",
                $"{job.Number}: {note}",
                "proposal", p.Id, job.Id),
            new[] { Recipient.User(Roles.Mechanic, p.MechanicId) }, ct);

        await PublishAsync(p.Id, job, toMechanic: true, toCustomer: false, ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    // ---------------------------------------------------------------- 3. Customer → Manager
    public async Task<ProposalDto> DecideAsync(Guid customerId, Guid proposalId, DecideItemsRequest req, string idempotencyKey, CancellationToken ct = default)
    {
        Guard.Against(string.IsNullOrWhiteSpace(idempotencyKey), "Idempotency-Key header is required.");
        Guard.Against(req.Decisions is null || req.Decisions.Count == 0, "Choose approve or reject for at least one item.");

        var (p, job) = await LoadAsync(proposalId, ct);
        if (job.CustomerId != customerId) throw new NotFoundException("Proposal");

        // Same key again (double tap, retry after timeout) → same answer, no second decision (AC-03).
        if (await db.ApprovalDecisions.AnyAsync(d => d.ProposalId == p.Id && d.IdempotencyKey == idempotencyKey, ct))
            return await read.ProposalAsync(p.Id, false, ct);

        var now = clock.UtcNow;
        var complete = false;
        foreach (var d in req.Decisions!)
        {
            complete = p.Decide(d.ItemId, d.Approve, d.Version, now);
            var item = p.Items.First(i => i.Id == d.ItemId);
            db.ApprovalDecisions.Add(new ApprovalDecisionRecord
            {
                ProposalId = p.Id,
                RepairItemId = item.Id,
                CustomerId = customerId,
                Approved = d.Approve,
                ItemVersion = item.Version,
                Amount = item.Amount,
                IdempotencyKey = idempotencyKey,
                DecidedAt = now,
            });
        }
        if (!string.IsNullOrWhiteSpace(req.Note)) p.CustomerNote = req.Note;
        if (complete) job.Status = JobStatus.AwaitingRelease;

        var approved = p.Items.Where(i => i.Status == RepairItemStatus.Approved).ToList();
        var rejected = p.Items.Where(i => i.Status == RepairItemStatus.Rejected).ToList();
        Audit(p, Roles.Customer, customerId, complete ? "Customer answered" : "Customer decided some items",
            $"Approved {approved.Count} of {p.Items.Count} · Rs {approved.Sum(i => i.Amount):N0}");
        await db.SaveChangesAsync(ct);

        var body = $"{job.CustomerName} · {job.Number}: approved {Names(approved)}"
                   + (rejected.Count > 0 ? $"; rejected {Names(rejected)}" : "")
                   + (complete ? ". Release the approved work to the mechanic." : ". Waiting for the remaining items.");
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.CustomerDecided,
                complete ? "Customer answered the approval" : "Customer decided some items",
                body, "proposal", p.Id, job.Id,
                new Dictionary<string, string> { ["route"] = "approvals", ["proposalId"] = p.Id.ToString() }),
            new[] { Recipient.AllStaff() }, ct);

        // The mechanic is deliberately NOT told yet: the manager releases the work.
        await PublishAsync(p.Id, job, toMechanic: false, toCustomer: true, ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    // ---------------------------------------------------------------- 4. Manager → Mechanic (release) + Customer (confirm)
    public async Task<ProposalDto> ReleaseAsync(Guid staffId, Guid proposalId, string? note, CancellationToken ct = default)
    {
        var (p, job) = await LoadAsync(proposalId, ct);
        var now = clock.UtcNow;
        var released = p.Release(staffId, note, now);
        job.BeginApprovedWork(now);

        foreach (var item in released.Where(i => i.PartId is not null))
            await inventory.ConsumeForJobAsync(item.PartId!.Value, item.Qty, job.Id, $"{job.Number}: {item.Title}", ct);

        var skipped = p.Items.Where(i => i.Status == RepairItemStatus.Rejected).ToList();
        Audit(p, Roles.Manager, staffId, "Released to mechanic", $"{released.Count} item(s) · Rs {released.Sum(i => i.Amount):N0}");
        db.ProgressUpdates.Add(new ProgressUpdate
        {
            JobCardId = job.Id,
            Stage = "Approved work",
            Percent = 40,
            ActorRole = Roles.Manager,
            ActorId = staffId,
            At = now,
            Message = released.Count > 0 ? $"Approved: {Names(released)}" : "No extra repairs approved; continuing the booked service.",
        });
        await db.SaveChangesAsync(ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.WorkReleased,
                "Approved work released",
                released.Count > 0
                    ? $"{job.Number}: do {Names(released)}." + (skipped.Count > 0 ? $" Skip {Names(skipped)} (customer declined)." : "")
                    : $"{job.Number}: customer declined the extra items. Continue the booked service only.",
                "proposal", p.Id, job.Id,
                new Dictionary<string, string> { ["route"] = "job", ["jobId"] = job.Id.ToString() }),
            new[] { Recipient.User(Roles.Mechanic, p.MechanicId) }, ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.WorkConfirmed,
                "Garage confirmed your approval",
                released.Count > 0 ? $"Work on {Names(released)} has started on your {job.VehicleLabel}." : "Only the booked service will be done.",
                "proposal", p.Id, job.Id),
            new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);

        await PublishAsync(p.Id, job, toMechanic: true, toCustomer: true, ct);
        await queue.RecalculateAsync(ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    // ---------------------------------------------------------------- Repricing after publication (BR-FP-08)
    public async Task<ProposalDto> ReviseItemAsync(Guid staffId, Guid proposalId, Guid itemId, decimal unitPrice, int qty, CancellationToken ct = default)
    {
        var (p, job) = await LoadAsync(proposalId, ct);
        var needsApproval = p.ReviseItem(itemId, unitPrice, qty, RevisionTolerance, clock.UtcNow);
        var item = p.Items.First(i => i.Id == itemId);
        if (needsApproval) job.Status = JobStatus.AwaitingCustomerApproval;
        Audit(p, Roles.Manager, staffId, needsApproval ? "Revised · needs approval again" : "Revised within tolerance",
            $"{item.Title}: {qty} × Rs {unitPrice:N0} (v{item.Version})");
        await db.SaveChangesAsync(ct);

        if (needsApproval)
        {
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.ItemRevised,
                    "Price changed · approval needed",
                    $"{item.Title} is now Rs {item.Amount:N0}. Please approve or reject the new amount.",
                    "proposal", p.Id, job.Id,
                    new Dictionary<string, string> { ["route"] = "approval", ["proposalId"] = p.Id.ToString() }),
                new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.ItemRevised,
                    "Item on hold",
                    $"{job.Number}: stop work on {item.Title} until the customer approves the new price.",
                    "proposal", p.Id, job.Id),
                new[] { Recipient.User(Roles.Mechanic, p.MechanicId) }, ct);
        }
        await PublishAsync(p.Id, job, toMechanic: true, toCustomer: true, ct);
        return await read.ProposalAsync(p.Id, false, ct);
    }

    public async Task<IReadOnlyList<ProposalDto>> ListForStaffAsync(string? status, CancellationToken ct = default)
    {
        var q = db.Proposals.Include(p => p.Items).AsNoTracking();
        if (Enum.TryParse<ProposalStatus>(status, true, out var s)) q = q.Where(p => p.Status == s);
        else q = q.Where(p => p.Status != ProposalStatus.Cancelled);
        var rows = await q.OrderByDescending(p => p.SubmittedAt).Take(100).ToListAsync(ct);
        var jobIds = rows.Select(r => r.JobCardId).Distinct().ToList();
        var jobs = await db.JobCards.AsNoTracking().Where(j => jobIds.Contains(j.Id)).ToDictionaryAsync(j => j.Id, ct);
        var list = new List<ProposalDto>();
        foreach (var p in rows) list.Add(await read.ProposalAsync(p, jobs[p.JobCardId], false, ct));
        return list;
    }

    private async Task<(RepairProposal, JobCard)> LoadAsync(Guid proposalId, CancellationToken ct)
    {
        var p = await db.Proposals.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == proposalId, ct)
                ?? throw new NotFoundException("Proposal");
        var job = await db.JobCards.FirstAsync(j => j.Id == p.JobCardId, ct);
        return (p, job);
    }

    private void Audit(RepairProposal p, string role, Guid actor, string action, string? detail)
        => db.ApprovalAudit.Add(new ApprovalAuditEntry
        {
            ProposalId = p.Id,
            JobCardId = p.JobCardId,
            ActorRole = role,
            ActorId = actor,
            Action = action,
            Detail = detail,
            At = clock.UtcNow,
        });

    private static string Names(IEnumerable<RepairItem> items)
    {
        var list = items.Select(i => i.Title).ToList();
        return list.Count == 0 ? "nothing" : string.Join(", ", list);
    }

    /// <summary>Each audience gets its own view: the mechanic's view hides undecided-by-manager customer answers.</summary>
    private async Task PublishAsync(Guid proposalId, JobCard job, bool toMechanic, bool toCustomer, CancellationToken ct)
    {
        var full = await read.ProposalAsync(proposalId, false, ct);
        await notifier.PublishAsync(RealtimeEvents.ApprovalUpdated, full, new[] { RealtimeGroups.Staff }, ct);
        if (toCustomer && full.PublishedAt is not null)
            await notifier.PublishAsync(RealtimeEvents.ApprovalUpdated, full, new[] { RealtimeGroups.User(job.CustomerId) }, ct);
        if (toMechanic && job.MechanicId is { } mech)
            await notifier.PublishAsync(RealtimeEvents.ApprovalUpdated, await read.ProposalAsync(proposalId, true, ct), new[] { RealtimeGroups.User(mech) }, ct);
        await notifier.PublishAsync(RealtimeEvents.JobUpdated, await read.JobAsync(job, ct), new[] { RealtimeGroups.Staff }, ct);
    }
}
