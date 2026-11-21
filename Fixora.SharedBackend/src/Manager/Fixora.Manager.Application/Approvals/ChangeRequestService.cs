using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Approvals;

/// <summary>Customer → Manager → Mechanic: change requests only reach the mechanic after the manager forwards them.</summary>
public sealed class ChangeRequestService(IManagerDb db, INotificationService notifier, IClock clock)
{
    public async Task<ChangeRequestDto> CreateAsync(Guid customerId, Guid jobId, ChangeRequestCreate req, CancellationToken ct = default)
    {
        Guard.Against(req.Changes is null || req.Changes.Count == 0, "Pick at least one change.");
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId && j.CustomerId == customerId, ct) ?? throw new NotFoundException("Job");
        var now = clock.UtcNow;
        var cr = new CustomerChangeRequest
        {
            JobCardId = job.Id,
            CustomerId = customerId,
            Number = await JobNumbers.NextChangeNumberAsync(db, now, ct),
            ChangesPipe = string.Join('|', req.Changes!.Select(c => c.Replace("|", "/").Trim())),
            Details = req.Details?.Trim() ?? "",
            CreatedAt = now,
        };
        db.ChangeRequests.Add(cr);
        await db.SaveChangesAsync(ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ChangeRequested,
                "Customer asked for a change",
                $"{job.CustomerName} · {job.Number}: {string.Join(", ", cr.Changes)}",
                "changeRequest", cr.Id, job.Id,
                new Dictionary<string, string> { ["route"] = "approvals" }),
            new[] { Recipient.AllStaff() }, ct);
        await Publish(cr, job, toMechanic: false, ct);
        return WorkshopReadModel.ChangeRequest(cr, job.Number);
    }

    public async Task<ChangeRequestDto> ForwardAsync(Guid staffId, Guid id, string? note, CancellationToken ct = default)
    {
        var (cr, job) = await LoadAsync(id, ct);
        cr.Forward(note, clock.UtcNow);
        await db.SaveChangesAsync(ct);

        if (job.MechanicId is { } mech)
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.ChangeForwarded,
                    "Customer change approved by manager",
                    $"{job.Number}: {string.Join(", ", cr.Changes)}" + (string.IsNullOrWhiteSpace(note) ? "" : $" — {note}"),
                    "changeRequest", cr.Id, job.Id),
                new[] { Recipient.User(Roles.Mechanic, mech) }, ct);
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ChangeForwarded,
                "Your request was sent to the mechanic",
                $"{cr.Number}: the manager approved it and passed it to the mechanic.",
                "changeRequest", cr.Id, job.Id),
            new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        await Publish(cr, job, toMechanic: true, ct);
        return WorkshopReadModel.ChangeRequest(cr, job.Number);
    }

    public async Task<ChangeRequestDto> DeclineAsync(Guid staffId, Guid id, string note, CancellationToken ct = default)
    {
        var (cr, job) = await LoadAsync(id, ct);
        cr.Decline(note, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ChangeDeclined,
                "Change request not possible",
                $"{cr.Number}: {note}",
                "changeRequest", cr.Id, job.Id),
            new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        await Publish(cr, job, toMechanic: false, ct);
        return WorkshopReadModel.ChangeRequest(cr, job.Number);
    }

    public async Task<ChangeRequestDto> AcknowledgeAsync(Guid mechanicId, Guid id, string? note, CancellationToken ct = default)
    {
        var (cr, job) = await LoadAsync(id, ct);
        if (job.MechanicId != mechanicId) throw new NotFoundException("Change request");
        cr.Acknowledge(note, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        var msg = new NotificationMessage(
            NotificationTypes.ChangeAcknowledged,
            "Mechanic is handling the change",
            $"{cr.Number} on {job.Number} acknowledged" + (string.IsNullOrWhiteSpace(note) ? "." : $": {note}"),
            "changeRequest", cr.Id, job.Id);
        await notifier.NotifyAsync(msg, new[] { Recipient.AllStaff(), Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        await Publish(cr, job, toMechanic: true, ct);
        return WorkshopReadModel.ChangeRequest(cr, job.Number);
    }

    public async Task<IReadOnlyList<ChangeRequestDto>> ListForStaffAsync(bool pendingOnly, CancellationToken ct = default)
    {
        var q = db.ChangeRequests.AsNoTracking();
        if (pendingOnly) q = q.Where(c => c.Status == ChangeRequestStatus.PendingManagerReview);
        var rows = await q.OrderByDescending(c => c.CreatedAt).Take(100).ToListAsync(ct);
        var jobIds = rows.Select(r => r.JobCardId).Distinct().ToList();
        var numbers = await db.JobCards.AsNoTracking().Where(j => jobIds.Contains(j.Id)).ToDictionaryAsync(j => j.Id, j => j.Number, ct);
        return rows.Select(r => WorkshopReadModel.ChangeRequest(r, numbers.GetValueOrDefault(r.JobCardId, ""))).ToList();
    }

    private async Task<(CustomerChangeRequest, JobCard)> LoadAsync(Guid id, CancellationToken ct)
    {
        var cr = await db.ChangeRequests.FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException("Change request");
        var job = await db.JobCards.FirstAsync(j => j.Id == cr.JobCardId, ct);
        return (cr, job);
    }

    private async Task Publish(CustomerChangeRequest cr, JobCard job, bool toMechanic, CancellationToken ct)
    {
        var dto = WorkshopReadModel.ChangeRequest(cr, job.Number);
        var groups = new List<string> { RealtimeGroups.Staff, RealtimeGroups.User(job.CustomerId) };
        if (toMechanic && job.MechanicId is { } mech) groups.Add(RealtimeGroups.User(mech));
        await notifier.PublishAsync(RealtimeEvents.ChangeRequestUpdated, dto, groups, ct);
    }
}
