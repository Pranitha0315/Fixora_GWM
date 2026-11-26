using Fixora.Manager.Application.Common;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Jobs;

/// <summary>Adaptive queue (USP 5): recalculates indicative ETAs and pushes them in real time.</summary>
public sealed class QueueService(IManagerDb db, INotificationService notifier, WorkshopReadModel read, IClock clock)
{
    public async Task RecalculateAsync(CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var workshop = await db.Workshops.AsNoTracking().FirstOrDefaultAsync(ct);
        var threshold = workshop?.EtaShiftNotifyMinutes ?? 20;
        var bayCount = await db.Bays.CountAsync(b => b.Active, ct);
        var jobs = await db.JobCards
            .Where(j => j.Status != JobStatus.Completed && j.Status != JobStatus.Closed)
            .ToListAsync(ct);

        var estimates = QueueEtaCalculator.Compute(
            jobs.Select(j => new QueueEtaCalculator.QueueJob(j.Id, j.Status, j.Priority, j.QueueOrder, j.CreatedAt, j.EstimatedMinutes, j.ElapsedMinutes(now))),
            bayCount, now).ToDictionary(e => e.JobId);

        var shifted = new List<(JobCard job, DateTime? before)>();
        foreach (var job in jobs)
        {
            if (!estimates.TryGetValue(job.Id, out var e)) continue;
            var before = job.EtaAt;
            job.QueuePosition = e.Position;
            job.EtaAt = e.EtaAt;
            if (before is not null && Math.Abs((e.EtaAt - before.Value).TotalMinutes) >= threshold)
                shifted.Add((job, before));
        }
        await db.SaveChangesAsync(ct);

        foreach (var (job, before) in shifted.Where(s => s.job.CustomerId != Guid.Empty))
        {
            var later = job.EtaAt > before;
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.QueueEtaChanged,
                    later ? "Your vehicle will take a little longer" : "Good news: your vehicle may be ready sooner",
                    $"New indicative ready time for {job.VehicleLabel}: {LocalTime.Clock(job.EtaAt)} (was {LocalTime.Clock(before)}). Times are estimates.",
                    "job", job.Id, job.Id,
                    new Dictionary<string, string> { ["etaAt"] = job.EtaAt?.ToString("o") ?? "" }),
                new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        }

        var board = await read.JobsAsync(jobs.OrderBy(j => j.QueuePosition).ThenBy(j => j.EtaAt), ct);
        await notifier.PublishAsync(RealtimeEvents.QueueUpdated, board, new[] { RealtimeGroups.Staff, RealtimeGroups.Role(Roles.Mechanic) }, ct);
        foreach (var job in jobs.Where(j => j.CustomerId != Guid.Empty))
            await notifier.PublishAsync(RealtimeEvents.QueueUpdated, WorkshopReadModel.Queue(job), new[] { RealtimeGroups.User(job.CustomerId) }, ct);
    }
}
