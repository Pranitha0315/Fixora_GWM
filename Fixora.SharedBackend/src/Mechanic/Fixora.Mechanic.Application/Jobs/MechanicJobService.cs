using Fixora.Customer.Contracts;
using Fixora.Manager.Contracts;

namespace Fixora.Mechanic.Application.Jobs;

public sealed record MechanicJobDetailDto(JobDetailDto Detail, DriveSenseHintDto? DriveSense);

/// <summary>Assigned jobs, progress, proposals and SOS alerts — all through manager / customer gateways.</summary>
public sealed class MechanicJobService(IWorkshopJobGateway jobs, ICustomerDirectory customers)
{
    public Task<IReadOnlyList<JobSummaryDto>> AssignedAsync(Guid mechanicId, CancellationToken ct) => jobs.ListAssignedJobsAsync(mechanicId, ct);
    public Task<IReadOnlyList<JobSummaryDto>> QueueBoardAsync(CancellationToken ct) => jobs.GetQueueBoardAsync(ct);

    /// <summary>Job card plus the DriveSense hint card when the vehicle is opted in (BR-DS-09).</summary>
    public async Task<MechanicJobDetailDto> DetailAsync(Guid mechanicId, Guid jobId, CancellationToken ct)
    {
        var detail = await jobs.GetJobAsync(mechanicId, jobId, ct);
        DriveSenseHintDto? hint = null; // DriveSense hint card arrives on Day 8
        return new MechanicJobDetailDto(detail, hint);
    }

    public Task<JobSummaryDto> ActionAsync(Guid mechanicId, Guid jobId, JobActionRequest req, CancellationToken ct) => jobs.ApplyJobActionAsync(mechanicId, jobId, req, ct);
}
