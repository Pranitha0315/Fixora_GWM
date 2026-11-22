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
        var hint = detail.Job.VehicleId == Guid.Empty ? null : await customers.GetDriveSenseHintAsync(detail.Job.VehicleId, ct);
        return new MechanicJobDetailDto(detail, hint);
    }

    public Task<JobSummaryDto> ActionAsync(Guid mechanicId, Guid jobId, JobActionRequest req, CancellationToken ct) => jobs.ApplyJobActionAsync(mechanicId, jobId, req, ct);

    /// <summary>Mechanic → Manager: the proposal goes to the manager first, never straight to the customer.</summary>
    public Task<ProposalDto> SubmitProposalAsync(Guid mechanicId, Guid jobId, SubmitProposalRequest req, CancellationToken ct) => jobs.SubmitProposalAsync(mechanicId, jobId, req, ct);
    public Task<IReadOnlyList<ProposalDto>> ProposalsAsync(Guid mechanicId, Guid jobId, CancellationToken ct) => jobs.ListProposalsAsync(mechanicId, jobId, ct);
    public Task<ChangeRequestDto> AcknowledgeChangeAsync(Guid mechanicId, Guid changeId, string? note, CancellationToken ct) => jobs.AcknowledgeChangeRequestAsync(mechanicId, changeId, note, ct);
}
