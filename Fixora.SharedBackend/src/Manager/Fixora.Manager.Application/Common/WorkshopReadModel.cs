using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Builds DTOs from manager-owned rows, resolving bay and mechanic names once per request.</summary>
public sealed class WorkshopReadModel(IManagerDb db, IMechanicDirectory mechanics, IMediaStorage media, IClock clock)
{
    private Dictionary<Guid, string>? _mechanicNames;
    private Dictionary<Guid, string>? _bayNames;

    public async Task<string?> MechanicNameAsync(Guid? id, CancellationToken ct = default)
    {
        if (id is null) return null;
        _mechanicNames ??= (await mechanics.ListAsync(ct)).ToDictionary(m => m.Id, m => m.Name);
        return _mechanicNames.TryGetValue(id.Value, out var n) ? n : null;
    }

    public async Task<string?> BayNameAsync(Guid? id, CancellationToken ct = default)
    {
        if (id is null) return null;
        _bayNames ??= await db.Bays.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.Name, ct);
        return _bayNames.TryGetValue(id.Value, out var n) ? n : null;
    }

    public async Task<JobSummaryDto> JobAsync(JobCard j, CancellationToken ct = default) => new(
        j.Id, j.Number, j.CustomerId, j.CustomerName, j.VehicleId, j.VehicleLabel,
        j.MechanicId, await MechanicNameAsync(j.MechanicId, ct), j.BayId, await BayNameAsync(j.BayId, ct),
        j.Status.ToString(), j.Priority, j.QueuePosition, j.EtaAt, j.EstimatedMinutes,
        Math.Round(j.ElapsedMinutes(clock.UtcNow), 1), j.CreatedAt, j.StartedAt, j.CompletedAt, j.Complaint);

    public async Task<IReadOnlyList<JobSummaryDto>> JobsAsync(IEnumerable<JobCard> jobs, CancellationToken ct = default)
    {
        var list = new List<JobSummaryDto>();
        foreach (var j in jobs) list.Add(await JobAsync(j, ct));
        return list;
    }

    public async Task<BookingDto> BookingAsync(Appointment a, CancellationToken ct = default) => new(
        a.Id, a.CustomerId, a.CustomerName, a.VehicleId, a.VehicleLabel, a.ServiceId, a.ServiceName, a.SlotStart, a.SlotEnd,
        a.Status.ToString(), a.Source.ToString(), a.JobCardId, a.BayId, await BayNameAsync(a.BayId, ct),
        a.MechanicId, await MechanicNameAsync(a.MechanicId, ct), a.Notes, a.PromoCode, a.DeclineReason, a.CreatedAt);

    public IssueDto Issue(InspectionIssue i) => new(
        i.Id, i.Component, i.FindingEn, i.FindingTa, i.RecommendationEn, i.RecommendationTa, i.Severity.ToString(),
        i.MediaRefs.Select(r => media.GetSignedUrl(r, TimeSpan.FromMinutes(15))).ToList(), i.ReportVersion, i.ConfirmedAt);

    /// <param name="maskForMechanic">Before the manager releases work the mechanic sees customer decisions as still pending.</param>
    public async Task<ProposalDto> ProposalAsync(RepairProposal p, JobCard job, bool maskForMechanic = false, CancellationToken ct = default)
    {
        var audit = await db.ApprovalAudit.AsNoTracking().Where(a => a.ProposalId == p.Id).OrderBy(a => a.At).ToListAsync(ct);
        var hideDecisions = maskForMechanic && p.Status is ProposalStatus.AwaitingCustomer or ProposalStatus.CustomerResponded;
        var items = p.Items.OrderBy(i => i.Kind).ThenBy(i => i.Title).Select(i => new RepairItemDto(
            i.Id, i.Title, i.Kind.ToString(), i.Qty, i.UnitPrice, i.Amount, i.Version,
            hideDecisions && i.Status is RepairItemStatus.Approved or RepairItemStatus.Rejected ? RepairItemStatus.AwaitingCustomer.ToString() : i.Status.ToString(),
            i.LinkedIssueId)).ToList();
        var status = hideDecisions && p.Status == ProposalStatus.CustomerResponded ? ProposalStatus.AwaitingCustomer.ToString() : p.Status.ToString();
        return new ProposalDto(
            p.Id, p.JobCardId, job.Number, job.VehicleLabel, job.CustomerName, status, p.MechanicId, await MechanicNameAsync(p.MechanicId, ct),
            p.MechanicNote, p.ManagerNote, maskForMechanic ? null : p.CustomerNote, p.SubmittedAt, p.PublishedAt, p.RespondedAt, p.ReleasedAt,
            p.Total, hideDecisions ? 0 : p.ApprovedTotal, items,
            audit.Where(a => !hideDecisions || a.ActorRole != Roles.Customer).Select(a => new AuditDto(a.ActorRole, a.Action, a.Detail, a.At)).ToList());
    }

    public async Task<ProposalDto> ProposalAsync(Guid proposalId, bool maskForMechanic = false, CancellationToken ct = default)
    {
        var p = await db.Proposals.Include(x => x.Items).AsNoTracking().FirstOrDefaultAsync(x => x.Id == proposalId, ct)
                ?? throw new NotFoundException("Proposal");
        var job = await db.JobCards.AsNoTracking().FirstAsync(j => j.Id == p.JobCardId, ct);
        return await ProposalAsync(p, job, maskForMechanic, ct);
    }

    public static ChangeRequestDto ChangeRequest(CustomerChangeRequest c, string jobNumber) => new(
        c.Id, c.JobCardId, jobNumber, c.Number, c.Changes, c.Details, c.Status.ToString(), c.ManagerNote, c.MechanicNote, c.CreatedAt);

    public static InvoiceDto Invoice(Invoice i) => new(
        i.Id, i.Number, i.JobCardId, i.CustomerId, i.Subtotal, i.Tax, i.LoyaltyDiscount, i.Total, i.Status.ToString(), i.PaymentMethod,
        i.IssuedAt, i.PaidAt, i.Lines.Select(l => new InvoiceLineDto(l.Description, l.Qty, l.UnitPrice, l.Amount)).ToList());

    public static QueueEstimateDto Queue(JobCard j) => new(j.Id, j.QueuePosition, j.IsActive ? j.EtaAt : null, j.Status.ToString());

    public enum Viewer { Staff, Mechanic, Customer }

    /// <summary>
    /// Customer view: only verified issues that were published with a forwarded proposal, and only
    /// proposals the manager already forwarded (AC-02: unverified/unreviewed work is unreachable).
    /// </summary>
    public async Task<JobDetailDto> JobDetailAsync(JobCard job, Viewer viewer, CancellationToken ct = default)
    {
        var timeline = await db.ProgressUpdates.AsNoTracking().Where(p => p.JobCardId == job.Id).OrderBy(p => p.At)
            .Select(p => new ProgressDto(p.Stage, p.Message, p.Percent, p.ActorRole, p.At)).ToListAsync(ct);

        var issuesQ = db.Issues.AsNoTracking().Where(i => i.JobCardId == job.Id);
        if (viewer == Viewer.Customer) issuesQ = issuesQ.Where(i => i.PublishedToCustomer);
        var issues = (await issuesQ.OrderBy(i => i.ConfirmedAt).ToListAsync(ct)).Select(Issue).ToList();

        var proposalsQ = db.Proposals.Include(p => p.Items).AsNoTracking().Where(p => p.JobCardId == job.Id);
        if (viewer == Viewer.Customer)
            proposalsQ = proposalsQ.Where(p => p.Status == ProposalStatus.AwaitingCustomer || p.Status == ProposalStatus.CustomerResponded || p.Status == ProposalStatus.ReleasedToMechanic);
        var proposals = new List<ProposalDto>();
        foreach (var p in await proposalsQ.OrderByDescending(p => p.SubmittedAt).ToListAsync(ct))
            proposals.Add(await ProposalAsync(p, job, viewer == Viewer.Mechanic, ct));

        var changesQ = db.ChangeRequests.AsNoTracking().Where(c => c.JobCardId == job.Id);
        if (viewer == Viewer.Mechanic)
            changesQ = changesQ.Where(c => c.Status == ChangeRequestStatus.ForwardedToMechanic || c.Status == ChangeRequestStatus.Acknowledged);
        var changes = (await changesQ.OrderByDescending(c => c.CreatedAt).ToListAsync(ct)).Select(c => ChangeRequest(c, job.Number)).ToList();

        var invoice = await db.Invoices.Include(i => i.Lines).AsNoTracking().FirstOrDefaultAsync(i => i.JobCardId == job.Id, ct);

        return new JobDetailDto(await JobAsync(job, ct), timeline, issues, proposals, changes,
            invoice is null ? null : Invoice(invoice), Queue(job));
    }
}
