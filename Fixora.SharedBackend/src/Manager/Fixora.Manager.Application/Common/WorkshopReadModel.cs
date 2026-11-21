using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Builds DTOs from manager-owned rows, resolving bay and mechanic names once per request.</summary>
public sealed class WorkshopReadModel(IManagerDb db, IMechanicDirectory mechanics, IClock clock)
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

        var issues = new List<IssueDto>(); // FixProof findings arrive on Day 6

        var proposals = new List<ProposalDto>();      // repair proposals arrive on Day 7
        var changes = new List<ChangeRequestDto>();   // change requests arrive on Day 7

        return new JobDetailDto(await JobAsync(job, ct), timeline, issues, proposals, changes,
            null, Queue(job)); // invoices arrive on Day 11
    }
}
