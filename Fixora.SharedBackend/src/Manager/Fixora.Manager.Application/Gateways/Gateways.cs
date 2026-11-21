using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Gateways;

/// <summary>Customer-facing gateway: canonical records stay manager-owned; customers only see their own.</summary>
public sealed class WorkshopGateway(
    IManagerDb db,
    BookingService bookings,
    JobService jobs,
    WorkshopSettingsService settings,
    WorkshopReadModel read,
    IClock clock) : IWorkshopGateway
{
    public async Task<GarageDto> GetGarageAsync(CancellationToken ct = default)
    {
        var w = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var open = w.IsOpenAt(clock.UtcNow);
        return new GarageDto(w.Id, w.Name, w.Phone, w.EmergencyPhone, w.Address, w.Lat, w.Lng, w.OpenTime.ToString("HH:mm"), w.CloseTime.ToString("HH:mm"),
            open, open ? null : $"Opens at {w.OpenTime:HH:mm}", w.LoyaltyEnabled, w.LoyaltyPercent, w.LoyaltyCapRupees);
    }

    public Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken ct = default) => settings.ServicesAsync(false, ct);

    public Task<IReadOnlyList<SlotDto>> GetSlotsAsync(DateOnly date, Guid serviceId, CancellationToken ct = default) => bookings.GetSlotsAsync(date, serviceId, ct);

    public Task<BookingDto> RequestBookingAsync(Guid customerId, string customerName, string vehicleLabel, BookingRequest request, string idempotencyKey, CancellationToken ct = default)
        => bookings.RequestAsync(customerId, customerName, vehicleLabel, request, idempotencyKey, ct);

    public Task<IReadOnlyList<BookingDto>> ListBookingsAsync(Guid customerId, CancellationToken ct = default) => bookings.ListForCustomerAsync(customerId, ct);

    public Task<BookingDto> CancelBookingAsync(Guid customerId, Guid bookingId, CancellationToken ct = default)
        => bookings.CancelAsync(customerId, Roles.Customer, bookingId, ct);

    public Task<BookingDto> RescheduleBookingAsync(Guid customerId, Guid bookingId, DateTime newSlotStart, CancellationToken ct = default)
        => bookings.RescheduleAsync(customerId, Roles.Customer, bookingId, newSlotStart, ct);

    public Task<IReadOnlyList<JobSummaryDto>> ListJobsAsync(Guid customerId, bool activeOnly, CancellationToken ct = default)
        => jobs.ListAsync(activeOnly, null, customerId, ct);

    public Task<JobDetailDto> GetJobAsync(Guid customerId, Guid jobId, CancellationToken ct = default)
        => jobs.GetAsync(jobId, WorkshopReadModel.Viewer.Customer, null, customerId, ct);

    public async Task<QueueEstimateDto> GetQueueEstimateAsync(Guid customerId, Guid jobId, CancellationToken ct = default)
    {
        var job = await db.JobCards.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId && j.CustomerId == customerId, ct) ?? throw new NotFoundException("Job");
        return WorkshopReadModel.Queue(job);
    }
}

/// <summary>Mechanic-facing gateway: only jobs assigned to the calling mechanic.</summary>
public sealed class WorkshopJobGateway(IManagerDb db, JobService jobs, WorkshopReadModel read) : IWorkshopJobGateway
{
    public Task<IReadOnlyList<JobSummaryDto>> ListAssignedJobsAsync(Guid mechanicId, CancellationToken ct = default) => jobs.ListAsync(false, mechanicId, null, ct);

    public Task<IReadOnlyList<JobSummaryDto>> GetQueueBoardAsync(CancellationToken ct = default) => jobs.ListAsync(true, null, null, ct);

    public Task<JobDetailDto> GetJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
        => jobs.GetAsync(jobId, WorkshopReadModel.Viewer.Mechanic, mechanicId, null, ct);

    public Task<JobSummaryDto> ApplyJobActionAsync(Guid mechanicId, Guid jobId, JobActionRequest request, CancellationToken ct = default)
        => jobs.ApplyMechanicActionAsync(mechanicId, jobId, request, ct);

    public async Task<Guid?> GetVehicleIdForJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
        => await db.JobCards.AsNoTracking().Where(j => j.Id == jobId && j.MechanicId == mechanicId).Select(j => (Guid?)j.VehicleId).FirstOrDefaultAsync(ct);
}

/// <summary>Who may join job:{id}: staff always; the assigned mechanic; the owning customer.</summary>
public sealed class RealtimeAccessPolicy(IManagerDb db) : IRealtimeAccessPolicy
{
    public async Task<bool> CanJoinJobAsync(Guid userId, string role, Guid jobId, CancellationToken ct = default)
    {
        if (Roles.IsStaff(role)) return true;
        return role switch
        {
            Roles.Mechanic => await db.JobCards.AnyAsync(j => j.Id == jobId && j.MechanicId == userId, ct),
            Roles.Customer => await db.JobCards.AnyAsync(j => j.Id == jobId && j.CustomerId == userId, ct),
            _ => false,
        };
    }
}
