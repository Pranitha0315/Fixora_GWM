using Fixora.Customer.Application.Common;
using Fixora.Customer.Application.Vehicles;
using Fixora.Manager.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Application.Workshop;

/// <summary>
/// The customer's window on manager-owned records. Adds customer-side checks (vehicle ownership, names)
/// before calling the authenticated manager gateway. The app never reads workshop tables directly.
/// </summary>
public sealed class CustomerWorkshopService(IWorkshopGateway workshop, VehicleService vehicles, ICustomerDb db)
{
    public Task<GarageDto> GarageAsync(CancellationToken ct) => workshop.GetGarageAsync(ct);
    public Task<IReadOnlyList<ServiceDto>> ServicesAsync(CancellationToken ct) => workshop.GetServicesAsync(ct);
    public Task<IReadOnlyList<SlotDto>> SlotsAsync(DateOnly date, Guid serviceId, CancellationToken ct) => workshop.GetSlotsAsync(date, serviceId, ct);

    public async Task<BookingDto> BookAsync(Guid customerId, BookingRequest req, string idempotencyKey, CancellationToken ct)
    {
        var vehicle = await vehicles.GetOwnedAsync(customerId, req.VehicleId, ct);
        var name = await db.Customers.AsNoTracking().Where(c => c.Id == customerId).Select(c => c.Name).FirstAsync(ct);
        return await workshop.RequestBookingAsync(customerId, name, vehicle.Label, req, idempotencyKey, ct);
    }

    public Task<IReadOnlyList<BookingDto>> BookingsAsync(Guid customerId, CancellationToken ct) => workshop.ListBookingsAsync(customerId, ct);
    public Task<BookingDto> CancelAsync(Guid customerId, Guid id, CancellationToken ct) => workshop.CancelBookingAsync(customerId, id, ct);
    public Task<BookingDto> RescheduleAsync(Guid customerId, Guid id, DateTime start, CancellationToken ct) => workshop.RescheduleBookingAsync(customerId, id, start, ct);
    public Task<IReadOnlyList<JobSummaryDto>> JobsAsync(Guid customerId, bool activeOnly, CancellationToken ct) => workshop.ListJobsAsync(customerId, activeOnly, ct);
    public Task<JobDetailDto> JobAsync(Guid customerId, Guid jobId, CancellationToken ct) => workshop.GetJobAsync(customerId, jobId, ct);
    public Task<QueueEstimateDto> QueueAsync(Guid customerId, Guid jobId, CancellationToken ct) => workshop.GetQueueEstimateAsync(customerId, jobId, ct);
}
