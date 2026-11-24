using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Jobs;

public sealed record AssignJobRequest(Guid MechanicId, Guid BayId);
public sealed record ReorderJobRequest(int Priority, int QueueOrder);
public sealed record ExtendJobRequest(int ExtraMinutes, string? Reason);

/// <summary>Job card lifecycle. Mechanic progress goes to the customer and the manager in real time.</summary>
public sealed class JobService(
    IManagerDb db,
    WorkshopReadModel read,
    INotificationService notifier,
    QueueService queue,
    BillingService billing,
    IClock clock)
{
    public async Task<JobSummaryDto> ApplyMechanicActionAsync(Guid mechanicId, Guid jobId, JobActionRequest req, CancellationToken ct = default)
    {
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId && j.MechanicId == mechanicId, ct) ?? throw new NotFoundException("Job");
        var now = clock.UtcNow;
        var action = (req.Action ?? "").Trim().ToLowerInvariant();
        string stage, message;
        int percent;
        switch (action)
        {
            case "start":
                job.Start(now);
                (stage, message, percent) = ("Inspection", req.Message ?? "Mechanic started the inspection.", 15);
                break;
            case "pause":
                job.Pause(now);
                (stage, message, percent) = ("Paused", req.Message ?? "Work paused.", LastPercent(job));
                break;
            case "resume":
                job.Resume(now);
                (stage, message, percent) = ("Repair", req.Message ?? "Work resumed.", LastPercent(job));
                break;
            case "progress":
                if (job.Status is JobStatus.AwaitingManagerReview or JobStatus.AwaitingCustomerApproval or JobStatus.AwaitingRelease)
                    throw new ConflictException("approval_pending", "Wait until the manager releases the approved work.");
                Guard.Against(string.IsNullOrWhiteSpace(req.Message), "Write a short progress message.");
                (stage, message, percent) = (req.Stage ?? "Repair", req.Message!, Math.Clamp(req.Percent ?? 60, 0, 99));
                break;
            case "complete":
                job.Complete(now);
                (stage, message, percent) = ("Ready for pickup", req.Message ?? "Work finished. Vehicle ready for pickup.", 100);
                break;
            default:
                throw new ValidationException("Action must be start, pause, resume, progress or complete.");
        }

        db.ProgressUpdates.Add(new ProgressUpdate { JobCardId = job.Id, Stage = stage, Message = message, Percent = percent, ActorRole = Roles.Mechanic, ActorId = mechanicId, At = now });
        await db.SaveChangesAsync(ct);

        if (action == "complete") await billing.CreateInvoiceForJobAsync(job.Id, ct);

        var type = action == "complete" ? NotificationTypes.JobCompleted : NotificationTypes.JobProgress;
        var title = action == "complete" ? "Your vehicle is ready" : $"{job.VehicleLabel}: {stage}";
        var recipients = new List<Recipient> { Recipient.AllStaff() };
        if (job.CustomerId != Guid.Empty) recipients.Add(Recipient.User(Roles.Customer, job.CustomerId));
        await notifier.NotifyAsync(new NotificationMessage(type, title, message, "job", job.Id, job.Id,
            new Dictionary<string, string> { ["route"] = "job", ["jobId"] = job.Id.ToString(), ["percent"] = percent.ToString() }), recipients, ct);

        await PublishJobAsync(job, ct);
        await queue.RecalculateAsync(ct);
        return await read.JobAsync(job, ct);
    }

    /// <summary>Mechanic confirmed a FixProof finding. Stays hidden from the customer until a proposal is forwarded.</summary>
    public async Task<IssueDto> AddVerifiedIssueAsync(Guid mechanicId, Guid jobId, VerifiedIssueInput input, CancellationToken ct = default)
    {
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId && j.MechanicId == mechanicId, ct) ?? throw new NotFoundException("Job");
        Guard.Against(string.IsNullOrWhiteSpace(input.Component) || string.IsNullOrWhiteSpace(input.FindingEn), "Component and finding are required.");
        var issue = new InspectionIssue
        {
            JobCardId = job.Id,
            Component = input.Component.Trim(),
            FindingEn = input.FindingEn.Trim(),
            FindingTa = input.FindingTa?.Trim() ?? "",
            RecommendationEn = input.RecommendationEn?.Trim() ?? "",
            RecommendationTa = input.RecommendationTa?.Trim() ?? "",
            Severity = Enum.TryParse<IssueSeverity>(input.Severity, true, out var s) ? s : IssueSeverity.Attention,
            MediaRefsCsv = string.Join(',', input.MediaRefs ?? Array.Empty<string>()),
            CreatedByMechanicId = mechanicId,
            ConfirmedAt = clock.UtcNow,
        };
        db.Issues.Add(issue);
        if (job.Status == JobStatus.Open) job.Start(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        await PublishJobAsync(job, ct);
        return read.Issue(issue);
    }

    public async Task<JobSummaryDto> AssignAsync(Guid staffId, Guid jobId, AssignJobRequest req, CancellationToken ct = default)
    {
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId, ct) ?? throw new NotFoundException("Job");
        var previous = job.MechanicId;
        job.MechanicId = req.MechanicId;
        job.BayId = req.BayId;
        await db.SaveChangesAsync(ct);
        if (previous != req.MechanicId)
        {
            await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.JobAssigned, "Job assigned to you", $"{job.Number} · {job.VehicleLabel}", "job", job.Id, job.Id,
                new Dictionary<string, string> { ["route"] = "job", ["jobId"] = job.Id.ToString() }), new[] { Recipient.User(Roles.Mechanic, req.MechanicId) }, ct);
            if (previous is { } p)
                await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.JobAssigned, "Job reassigned", $"{job.Number} moved to another mechanic.", "job", job.Id, job.Id),
                    new[] { Recipient.User(Roles.Mechanic, p) }, ct);
        }
        await PublishJobAsync(job, ct);
        await queue.RecalculateAsync(ct);
        return await read.JobAsync(job, ct);
    }

    public async Task<JobSummaryDto> ReorderAsync(Guid jobId, ReorderJobRequest req, CancellationToken ct = default)
    {
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId, ct) ?? throw new NotFoundException("Job");
        job.Priority = req.Priority;
        job.QueueOrder = req.QueueOrder;
        await db.SaveChangesAsync(ct);
        await queue.RecalculateAsync(ct);
        return await read.JobAsync(job, ct);
    }

    /// <summary>Running job takes longer: everyone behind it gets a new ETA (acceptance: +40 min case).</summary>
    public async Task<JobSummaryDto> ExtendAsync(Guid jobId, ExtendJobRequest req, CancellationToken ct = default)
    {
        Guard.Against(req.ExtraMinutes is < -120 or > 480, "Extra minutes must be between -120 and 480.");
        var job = await db.JobCards.FirstOrDefaultAsync(j => j.Id == jobId, ct) ?? throw new NotFoundException("Job");
        job.EstimatedMinutes = Math.Max(10, job.EstimatedMinutes + req.ExtraMinutes);
        await db.SaveChangesAsync(ct);
        await queue.RecalculateAsync(ct);
        return await read.JobAsync(job, ct);
    }

    public async Task<IReadOnlyList<JobSummaryDto>> ListAsync(bool activeOnly, Guid? mechanicId, Guid? customerId, CancellationToken ct = default)
    {
        var q = db.JobCards.AsNoTracking();
        if (activeOnly) q = q.Where(j => j.Status != JobStatus.Completed && j.Status != JobStatus.Closed);
        if (mechanicId is { } m) q = q.Where(j => j.MechanicId == m);
        if (customerId is { } c) q = q.Where(j => j.CustomerId == c);
        var rows = await q.OrderBy(j => j.Status == JobStatus.Completed || j.Status == JobStatus.Closed)
            .ThenBy(j => j.QueuePosition).ThenByDescending(j => j.CreatedAt).Take(200).ToListAsync(ct);
        return await read.JobsAsync(rows, ct);
    }

    public async Task<JobDetailDto> GetAsync(Guid jobId, WorkshopReadModel.Viewer viewer, Guid? mechanicId, Guid? customerId, CancellationToken ct = default)
    {
        var job = await db.JobCards.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId, ct) ?? throw new NotFoundException("Job");
        if (mechanicId is { } m && job.MechanicId != m) throw new NotFoundException("Job");
        if (customerId is { } c && job.CustomerId != c) throw new NotFoundException("Job");
        return await read.JobDetailAsync(job, viewer, ct);
    }

    private static int LastPercent(JobCard job) => job.Status == JobStatus.Paused ? 50 : 60;

    private async Task PublishJobAsync(JobCard job, CancellationToken ct)
    {
        var dto = await read.JobAsync(job, ct);
        var groups = new List<string> { RealtimeGroups.Staff, RealtimeGroups.Job(job.Id) };
        if (job.CustomerId != Guid.Empty) groups.Add(RealtimeGroups.User(job.CustomerId));
        if (job.MechanicId is { } m) groups.Add(RealtimeGroups.User(m));
        await notifier.PublishAsync(RealtimeEvents.JobUpdated, dto, groups, ct);
    }
}
