using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

public enum JobStatus
{
    Open,
    Inspecting,
    AwaitingManagerReview,
    AwaitingCustomerApproval,
    AwaitingRelease,
    InProgress,
    Paused,
    Completed,
    Closed,
}

/// <summary>Canonical job card. Mechanic and customer apps only read/act through gateways.</summary>
public sealed class JobCard : Entity
{
    public string Number { get; set; } = "";
    public Guid? AppointmentId { get; set; }
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public Guid VehicleId { get; set; }
    public string VehicleLabel { get; set; } = "";
    public Guid? MechanicId { get; set; }
    public Guid? BayId { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Open;
    public string? Complaint { get; set; }
    /// <summary>Higher runs first: SOS conversion 2, loyalty priority tier 1, normal 0.</summary>
    public int Priority { get; set; }
    public int EstimatedMinutes { get; set; } = 60;
    public int QueueOrder { get; set; }
    public int QueuePosition { get; set; }
    public DateTime? EtaAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? RunningSince { get; set; }
    public double WorkedMinutes { get; set; }
    public DateTime? CompletedAt { get; set; }

    public bool IsActive => Status is not (JobStatus.Completed or JobStatus.Closed);

    public double ElapsedMinutes(DateTime now)
        => WorkedMinutes + (RunningSince is { } since ? (now - since).TotalMinutes : 0);

    public void Start(DateTime now)
    {
        if (Status != JobStatus.Open)
            throw new ConflictException("job_already_started", "This job has already been started.");
        StartedAt = now;
        RunningSince = now;
        Status = JobStatus.Inspecting;
    }

    /// <summary>Approved work released by the manager: the job runs again.</summary>
    public void BeginApprovedWork(DateTime now)
    {
        RunningSince ??= now;
        StartedAt ??= now;
        Status = JobStatus.InProgress;
    }

    public void Pause(DateTime now)
    {
        if (Status != JobStatus.InProgress)
            throw new ConflictException("job_not_running", "Only a running job can be paused.");
        StopClock(now);
        Status = JobStatus.Paused;
    }

    public void Resume(DateTime now)
    {
        if (Status != JobStatus.Paused)
            throw new ConflictException("job_not_paused", "Only a paused job can be resumed.");
        RunningSince = now;
        Status = JobStatus.InProgress;
    }

    public void Complete(DateTime now)
    {
        if (Status is not (JobStatus.InProgress or JobStatus.Paused or JobStatus.Inspecting))
            throw new ConflictException("job_cannot_complete", "Finish the approved work before completing the job.");
        StopClock(now);
        Status = JobStatus.Completed;
        CompletedAt = now;
    }

    private void StopClock(DateTime now)
    {
        if (RunningSince is { } since)
        {
            WorkedMinutes += (now - since).TotalMinutes;
            RunningSince = null;
        }
    }
}

public sealed class ProgressUpdate : Entity
{
    public Guid JobCardId { get; set; }
    public string Stage { get; set; } = "";
    public string Message { get; set; } = "";
    public int Percent { get; set; }
    public string ActorRole { get; set; } = "";
    public Guid ActorId { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
}
