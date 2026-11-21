using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
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
}
