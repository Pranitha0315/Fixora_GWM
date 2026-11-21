namespace Fixora.Manager.Contracts;

/// <summary>
/// The "bookings / approvals gateway" (architecture diagram 04): the only way the Customer
/// application reaches manager-owned records. Every method enforces customer ownership.
/// </summary>
public interface IWorkshopGateway
{
    Task<GarageDto> GetGarageAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<SlotDto>> GetSlotsAsync(DateOnly date, Guid serviceId, CancellationToken ct = default);
    Task<BookingDto> RequestBookingAsync(Guid customerId, string customerName, string vehicleLabel, BookingRequest request, string idempotencyKey, CancellationToken ct = default);
    Task<IReadOnlyList<BookingDto>> ListBookingsAsync(Guid customerId, CancellationToken ct = default);
    Task<BookingDto> CancelBookingAsync(Guid customerId, Guid bookingId, CancellationToken ct = default);
    Task<BookingDto> RescheduleBookingAsync(Guid customerId, Guid bookingId, DateTime newSlotStart, CancellationToken ct = default);
    Task<IReadOnlyList<JobSummaryDto>> ListJobsAsync(Guid customerId, bool activeOnly, CancellationToken ct = default);
    Task<JobDetailDto> GetJobAsync(Guid customerId, Guid jobId, CancellationToken ct = default);
    Task<QueueEstimateDto> GetQueueEstimateAsync(Guid customerId, Guid jobId, CancellationToken ct = default);
}

/// <summary>The "job / inspection gateway" used by the Mechanic application.</summary>
public interface IWorkshopJobGateway
{
    Task<IReadOnlyList<JobSummaryDto>> ListAssignedJobsAsync(Guid mechanicId, CancellationToken ct = default);
    Task<IReadOnlyList<JobSummaryDto>> GetQueueBoardAsync(CancellationToken ct = default);
    Task<JobDetailDto> GetJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default);
    Task<JobSummaryDto> ApplyJobActionAsync(Guid mechanicId, Guid jobId, JobActionRequest request, CancellationToken ct = default);
    Task<IssueDto> PublishVerifiedIssueAsync(Guid mechanicId, Guid jobId, VerifiedIssueInput issue, CancellationToken ct = default);
    Task<Guid?> GetVehicleIdForJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default);
}

public interface IInvitationGateway
{
    Task<InvitationInfo?> FindValidAsync(string token, CancellationToken ct = default);
    Task MarkAcceptedAsync(Guid invitationId, Guid mechanicId, CancellationToken ct = default);
}
