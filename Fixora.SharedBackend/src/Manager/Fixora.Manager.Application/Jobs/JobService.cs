using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Jobs;

public sealed record AssignJobRequest(Guid MechanicId, Guid BayId);

public sealed record ReorderJobRequest(int Priority, int QueueOrder);

public sealed record ExtendJobRequest(int ExtraMinutes, string? Reason);

/// <summary>
/// Handles job card lifecycle and publishes job updates.
/// </summary>
public sealed class JobService(
    IManagerDb db,
    WorkshopReadModel read,
    INotificationService notifier,
    QueueService queue,
    BillingService billing,
    IMechanicDirectory mechanics,
    IClock clock)
{
    public async Task<JobSummaryDto> ApplyMechanicActionAsync(
        Guid mechanicId,
        Guid jobId,
        JobActionRequest req,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(req);

        var job = await db.JobCards.FirstOrDefaultAsync(
            j => j.Id == jobId && j.MechanicId == mechanicId,
            ct) ?? throw new NotFoundException("Job");

        var now = clock.UtcNow;
        var action = (req.Action ?? string.Empty)
            .Trim()
            .ToLowerInvariant();

        string stage;
        string message;
        int percent;

        switch (action)
        {
            case "start":
                job.Start(now);

                stage = "Inspection";
                message = MessageOrDefault(
                    req.Message,
                    "Mechanic started the inspection.");
                percent = 15;
                break;

            case "pause":
                percent = await LastPercentAsync(job.Id, ct);
                job.Pause(now);

                stage = "Paused";
                message = MessageOrDefault(
                    req.Message,
                    "Work paused.");
                break;

            case "resume":
                percent = await LastPercentAsync(job.Id, ct);
                job.Resume(now);

                stage = "Repair";
                message = MessageOrDefault(
                    req.Message,
                    "Work resumed.");
                break;

            case "progress":
                job.EnsureCanReportProgress();

                Guard.Against(
                    string.IsNullOrWhiteSpace(req.Message),
                    "Write a short progress message.");

                stage = MessageOrDefault(req.Stage, "Repair");
                message = req.Message!.Trim();
                percent = Math.Clamp(req.Percent ?? 60, 0, 99);
                break;

            case "complete":
                job.Complete(now);

                stage = "Ready for pickup";
                message = MessageOrDefault(
                    req.Message,
                    "Work finished. Vehicle ready for pickup.");
                percent = 100;
                break;

            default:
                throw new ValidationException(
                    "Action must be start, pause, resume, progress or complete.");
        }

        db.ProgressUpdates.Add(new ProgressUpdate
        {
            JobCardId = job.Id,
            Stage = stage,
            Message = message,
            Percent = percent,
            ActorRole = Roles.Mechanic,
            ActorId = mechanicId,
            At = now
        });

        await db.SaveChangesAsync(ct);

        if (action == "complete")
        {
            await billing.CreateInvoiceForJobAsync(job.Id, ct);
        }

        var notificationType = action == "complete"
            ? NotificationTypes.JobCompleted
            : NotificationTypes.JobProgress;

        var title = action == "complete"
            ? "Your vehicle is ready"
            : $"{job.VehicleLabel}: {stage}";

        var recipients = new List<Recipient>
        {
            Recipient.AllStaff()
        };

        if (job.CustomerId != Guid.Empty)
        {
            recipients.Add(
                Recipient.User(Roles.Customer, job.CustomerId));
        }

        await notifier.NotifyAsync(
            new NotificationMessage(
                notificationType,
                title,
                message,
                "job",
                job.Id,
                job.Id,
                new Dictionary<string, string>
                {
                    ["route"] = "job",
                    ["jobId"] = job.Id.ToString(),
                    ["percent"] = percent.ToString(
                        System.Globalization.CultureInfo.InvariantCulture)
                }),
            recipients,
            ct);

        await queue.RecalculateAsync(ct);
        await PublishJobAsync(job, ct);

        return await read.JobAsync(job, ct);
    }

    /// <summary>
    /// Records a mechanic-verified finding.
    /// Customer visibility must be enforced by the read model.
    /// </summary>
    public async Task<IssueDto> AddVerifiedIssueAsync(
        Guid mechanicId,
        Guid jobId,
        VerifiedIssueInput input,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(input);

        var job = await db.JobCards.FirstOrDefaultAsync(
            j => j.Id == jobId && j.MechanicId == mechanicId,
            ct) ?? throw new NotFoundException("Job");

        Guard.Against(
            string.IsNullOrWhiteSpace(input.Component) ||
            string.IsNullOrWhiteSpace(input.FindingEn),
            "Component and finding are required.");

        if (job.Status is JobStatus.Completed or JobStatus.Closed)
        {
            throw new ConflictException(
                "job_finished",
                "Cannot add findings to a completed or closed job.");
        }

        var severity =
            Enum.TryParse<IssueSeverity>(
                input.Severity,
                true,
                out var parsedSeverity) &&
            Enum.IsDefined(typeof(IssueSeverity), parsedSeverity)
                ? parsedSeverity
                : IssueSeverity.Attention;

        var mediaRefs = (input.MediaRefs ?? Array.Empty<string>())
            .Where(reference => !string.IsNullOrWhiteSpace(reference))
            .Select(reference => reference.Trim())
            .Distinct();

        var now = clock.UtcNow;

        var issue = new InspectionIssue
        {
            JobCardId = job.Id,
            Component = input.Component.Trim(),
            FindingEn = input.FindingEn.Trim(),
            FindingTa = input.FindingTa?.Trim() ?? string.Empty,
            RecommendationEn =
                input.RecommendationEn?.Trim() ?? string.Empty,
            RecommendationTa =
                input.RecommendationTa?.Trim() ?? string.Empty,
            Severity = severity,
            MediaRefsCsv = string.Join(",", mediaRefs),
            CreatedByMechanicId = mechanicId,
            ConfirmedAt = now
        };

        if (job.Status == JobStatus.Open)
        {
            job.Start(now);
        }

        db.Issues.Add(issue);
        await db.SaveChangesAsync(ct);

        await PublishJobAsync(job, ct);

        return read.Issue(issue);
    }

    public async Task<JobSummaryDto> AssignAsync(
        Guid staffId,
        Guid jobId,
        AssignJobRequest req,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(req);

        Guard.Against(
            req.MechanicId == Guid.Empty,
            "Mechanic is required.");

        Guard.Against(
            req.BayId == Guid.Empty,
            "Bay is required.");

        var job = await db.JobCards.FirstOrDefaultAsync(
            j => j.Id == jobId,
            ct) ?? throw new NotFoundException("Job");

        if (job.Status is JobStatus.Completed or JobStatus.Closed)
        {
            throw new ConflictException(
                "job_finished",
                "Cannot reassign a completed or closed job.");
        }

        var account = await mechanics.GetAsync(req.MechanicId, ct)
            ?? throw new NotFoundException("Mechanic");

        if (!account.Active)
        {
            throw new ConflictException(
                "mechanic_inactive",
                "Only an active mechanic account can be assigned.");
        }

        var previousMechanicId = job.MechanicId;

        job.MechanicId = req.MechanicId;
        job.BayId = req.BayId;

        await db.SaveChangesAsync(ct);

        if (previousMechanicId != req.MechanicId)
        {
            await notifier.NotifyAsync(
                new NotificationMessage(
                    NotificationTypes.JobAssigned,
                    "Job assigned to you",
                    $"{job.Number} · {job.VehicleLabel}",
                    "job",
                    job.Id,
                    job.Id,
                    new Dictionary<string, string>
                    {
                        ["route"] = "job",
                        ["jobId"] = job.Id.ToString()
                    }),
                new[]
                {
                    Recipient.User(Roles.Mechanic, req.MechanicId)
                },
                ct);

            if (previousMechanicId is Guid previousId &&
                previousId != Guid.Empty)
            {
                await notifier.NotifyAsync(
                    new NotificationMessage(
                        NotificationTypes.JobAssigned,
                        "Job reassigned",
                        $"{job.Number} moved to another mechanic.",
                        "job",
                        job.Id,
                        job.Id),
                    new[]
                    {
                        Recipient.User(Roles.Mechanic, previousId)
                    },
                    ct);
            }
        }

        await queue.RecalculateAsync(ct);
        await PublishJobAsync(job, ct);

        return await read.JobAsync(job, ct);
    }

    public async Task<JobSummaryDto> ReorderAsync(
        Guid jobId,
        ReorderJobRequest req,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(req);

        var job = await db.JobCards.FirstOrDefaultAsync(
            j => j.Id == jobId,
            ct) ?? throw new NotFoundException("Job");

        job.Priority = req.Priority;
        job.QueueOrder = req.QueueOrder;

        await db.SaveChangesAsync(ct);
        await queue.RecalculateAsync(ct);
        await PublishJobAsync(job, ct);

        return await read.JobAsync(job, ct);
    }

    /// <summary>
    /// Adjusts the estimated duration and recalculates queue ETAs.
    /// </summary>
    public async Task<JobSummaryDto> ExtendAsync(
        Guid jobId,
        ExtendJobRequest req,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(req);

        Guard.Against(
            req.ExtraMinutes is < -120 or > 480,
            "Extra minutes must be between -120 and 480.");

        var job = await db.JobCards.FirstOrDefaultAsync(
            j => j.Id == jobId,
            ct) ?? throw new NotFoundException("Job");

        job.EstimatedMinutes = Math.Max(
            10,
            job.EstimatedMinutes + req.ExtraMinutes);

        await db.SaveChangesAsync(ct);
        await queue.RecalculateAsync(ct);
        await PublishJobAsync(job, ct);

        return await read.JobAsync(job, ct);
    }

    public async Task<IReadOnlyList<JobSummaryDto>> ListAsync(
        bool activeOnly,
        Guid? mechanicId,
        Guid? customerId,
        CancellationToken ct = default)
    {
        var query = db.JobCards.AsNoTracking();

        if (activeOnly)
        {
            query = query.Where(
                j => j.Status != JobStatus.Completed &&
                     j.Status != JobStatus.Closed);
        }

        if (mechanicId is Guid selectedMechanicId)
        {
            query = query.Where(
                j => j.MechanicId == selectedMechanicId);
        }

        if (customerId is Guid selectedCustomerId)
        {
            query = query.Where(
                j => j.CustomerId == selectedCustomerId);
        }

        var rows = await query
            .OrderBy(
                j => j.Status == JobStatus.Completed ||
                     j.Status == JobStatus.Closed)
            .ThenBy(j => j.QueuePosition)
            .ThenByDescending(j => j.CreatedAt)
            .Take(200)
            .ToListAsync(ct);

        return await read.JobsAsync(rows, ct);
    }

    public async Task<JobDetailDto> GetAsync(
        Guid jobId,
        WorkshopReadModel.Viewer viewer,
        Guid? mechanicId,
        Guid? customerId,
        CancellationToken ct = default)
    {
        var job = await db.JobCards
            .AsNoTracking()
            .FirstOrDefaultAsync(
                j => j.Id == jobId,
                ct) ?? throw new NotFoundException("Job");

        if (mechanicId is Guid selectedMechanicId &&
            job.MechanicId != selectedMechanicId)
        {
            throw new NotFoundException("Job");
        }

        if (customerId is Guid selectedCustomerId &&
            job.CustomerId != selectedCustomerId)
        {
            throw new NotFoundException("Job");
        }

        return await read.JobDetailAsync(job, viewer, ct);
    }

    private async Task<int> LastPercentAsync(
        Guid jobId,
        CancellationToken ct)
    {
        var percent = await db.ProgressUpdates
            .AsNoTracking()
            .Where(update => update.JobCardId == jobId)
            .OrderByDescending(update => update.At)
            .Select(update => (int?)update.Percent)
            .FirstOrDefaultAsync(ct);

        return Math.Clamp(percent ?? 15, 0, 99);
    }

    private static string MessageOrDefault(
        string? value,
        string fallback)
    {
        return string.IsNullOrWhiteSpace(value)
            ? fallback
            : value.Trim();
    }

    private async Task PublishJobAsync(
        JobCard job,
        CancellationToken ct)
    {
        var dto = await read.JobAsync(job, ct);

        var groups = new List<string>
        {
            RealtimeGroups.Staff,
            RealtimeGroups.Job(job.Id)
        };

        if (job.CustomerId != Guid.Empty)
        {
            groups.Add(RealtimeGroups.User(job.CustomerId));
        }

        if (job.MechanicId is Guid mechanicId &&
            mechanicId != Guid.Empty)
        {
            groups.Add(RealtimeGroups.User(mechanicId));
        }

        await notifier.PublishAsync(
            RealtimeEvents.JobUpdated,
            dto,
            groups.Distinct().ToList(),
            ct);
    }
}