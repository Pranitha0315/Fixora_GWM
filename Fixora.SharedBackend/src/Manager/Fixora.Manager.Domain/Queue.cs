namespace Fixora.Manager.Domain;

/// <summary>
/// Pure, testable ETA engine (BR-AQ-07). Running jobs keep their bay until their remaining
/// estimate is used; waiting jobs take the first bay to free up, ordered by priority, manual
/// order, then arrival. Every ETA is indicative.
/// </summary>
public static class QueueEtaCalculator
{
    public sealed record QueueJob(Guid JobId, JobStatus Status, int Priority, int QueueOrder, DateTime CreatedAt, int EstimatedMinutes, double ElapsedMinutes);

    public sealed record Estimate(Guid JobId, int Position, DateTime EtaAt);

    private const int MinimumRemainingMinutes = 10;

    public static IReadOnlyList<Estimate> Compute(IEnumerable<QueueJob> jobs, int bayCount, DateTime now)
    {
        var bays = Enumerable.Repeat(now, Math.Max(1, bayCount)).ToList();
        var result = new List<Estimate>();
        var all = jobs.ToList();

        var running = all.Where(j => j.Status != JobStatus.Open).OrderBy(j => j.CreatedAt).ToList();
        foreach (var job in running)
        {
            var remaining = Math.Max(MinimumRemainingMinutes, job.EstimatedMinutes - job.ElapsedMinutes);
            var bay = IndexOfEarliest(bays);
            var eta = Max(bays[bay], now).AddMinutes(remaining);
            bays[bay] = eta;
            result.Add(new Estimate(job.JobId, 0, eta));
        }

        var waiting = all.Where(j => j.Status == JobStatus.Open)
            .OrderByDescending(j => j.Priority)
            .ThenBy(j => j.QueueOrder)
            .ThenBy(j => j.CreatedAt)
            .ToList();
        var position = 1;
        foreach (var job in waiting)
        {
            var bay = IndexOfEarliest(bays);
            var eta = Max(bays[bay], now).AddMinutes(Math.Max(MinimumRemainingMinutes, job.EstimatedMinutes));
            bays[bay] = eta;
            result.Add(new Estimate(job.JobId, position++, eta));
        }
        return result;
    }

    private static int IndexOfEarliest(List<DateTime> bays)
    {
        var idx = 0;
        for (var i = 1; i < bays.Count; i++)
            if (bays[i] < bays[idx]) idx = i;
        return idx;
    }

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
}
