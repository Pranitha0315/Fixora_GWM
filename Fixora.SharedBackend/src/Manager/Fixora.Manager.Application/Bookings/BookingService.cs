using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Bookings;

public sealed record ConfirmBookingRequest(Guid BayId, Guid MechanicId, string? Note);
public sealed record DeclineBookingRequest(string Reason);
public sealed record RescheduleRequest(DateTime SlotStart);

/// <summary>Customer → Manager → (Customer + Mechanic) booking flow with server-side capacity (USP 5).</summary>
public sealed class BookingService(
    IManagerDb db,
    WorkshopReadModel read,
    ICustomerDirectory customers,
    IClock clock)
{
    // One branch, one API instance: a process-wide lock makes the capacity check + insert atomic.
    private static readonly SemaphoreSlim CapacityLock = new(1, 1);

    /// <param name="date">The workshop's local calendar date.</param>
    public async Task<IReadOnlyList<SlotDto>> GetSlotsAsync(DateOnly date, Guid serviceId, CancellationToken ct = default)
    {
        var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var service = await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Id == serviceId && s.Active, ct) ?? throw new NotFoundException("Service");
        if (date.DayOfWeek == DayOfWeek.Sunday) return Array.Empty<SlotDto>();
        var bays = await db.Bays.CountAsync(b => b.Active, ct);
        var openUtc = workshop.ToUtc(date.ToDateTime(workshop.OpenTime));
        var closeUtc = workshop.ToUtc(date.ToDateTime(workshop.CloseTime));
        var taken = await db.Appointments.AsNoTracking()
            .Where(a => a.SlotStart < closeUtc && a.SlotEnd > openUtc &&
                        (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed || a.Status == AppointmentStatus.CheckedIn))
            .Select(a => new { a.SlotStart, a.SlotEnd }).ToListAsync(ct);

        var slots = new List<SlotDto>();
        var now = clock.UtcNow;
        for (var t = openUtc; t.AddMinutes(service.StandardMinutes) <= closeUtc; t = t.AddMinutes(workshop.SlotMinutes))
        {
            if (t <= now) continue;
            var end = t.AddMinutes(service.StandardMinutes);
            var used = taken.Count(a => a.SlotStart < end && a.SlotEnd > t);
            var free = bays - used;
            if (free > 0) slots.Add(new SlotDto(t, end, free)); // unavailable slots are never offered (BR-AQ-02)
        }
        return slots;
    }

    public async Task<BookingDto> RequestAsync(Guid customerId, string customerName, string vehicleLabel, BookingRequest req, string idempotencyKey, CancellationToken ct = default)
    {
        Guard.Against(string.IsNullOrWhiteSpace(idempotencyKey), "Idempotency-Key header is required.");
        var existing = await db.Appointments.AsNoTracking().FirstOrDefaultAsync(a => a.CustomerId == customerId && a.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return await read.BookingAsync(existing, ct);

        var service = await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.ServiceId && s.Active, ct) ?? throw new NotFoundException("Service");
        var now = clock.UtcNow;
        Guard.Against(req.SlotStart <= now, "Pick a future time.");

        Appointment appt;
        await CapacityLock.WaitAsync(ct);
        try
        {
            await EnsureCapacityAsync(req.SlotStart, req.SlotStart.AddMinutes(service.StandardMinutes), null, ct);
            appt = new Appointment
            {
                CustomerId = customerId,
                CustomerName = customerName,
                VehicleId = req.VehicleId,
                VehicleLabel = vehicleLabel,
                ServiceId = service.Id,
                ServiceName = service.Name,
                SlotStart = req.SlotStart,
                SlotEnd = req.SlotStart.AddMinutes(service.StandardMinutes),
                Notes = req.Notes,
                PromoCode = string.IsNullOrWhiteSpace(req.PromoCode) ? null : req.PromoCode.Trim().ToUpperInvariant(),
                SuggestionId = req.SuggestionId,
                Source = req.SuggestionId is not null ? BookingSource.DriveSense : !string.IsNullOrWhiteSpace(req.PromoCode) ? BookingSource.Promo : BookingSource.App,
                IdempotencyKey = idempotencyKey,
                CreatedAt = now,
            };
            db.Appointments.Add(appt);
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            CapacityLock.Release();
        }

        var dto = await read.BookingAsync(appt, ct);
        return dto;
    }

    public async Task<BookingDto> ConfirmAsync(Guid staffId, Guid bookingId, ConfirmBookingRequest req, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        Guard.Against(!await db.Bays.AnyAsync(b => b.Id == req.BayId && b.Active, ct), "Pick an active bay.");
        appt.Confirm(req.BayId, req.MechanicId, clock.UtcNow);
        await db.SaveChangesAsync(ct);

        var dto = await read.BookingAsync(appt, ct);
        return dto;
    }

    public async Task<BookingDto> DeclineAsync(Guid staffId, Guid bookingId, string reason, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        appt.Decline(reason, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        var dto = await read.BookingAsync(appt, ct);
        return dto;
    }

    public async Task<BookingDto> CancelAsync(Guid actorId, string actorRole, Guid bookingId, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        var byStaff = Roles.IsStaff(actorRole);
        if (!byStaff && appt.CustomerId != actorId) throw new NotFoundException("Booking");
        var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
        appt.Cancel(clock.UtcNow, workshop.CancelCutoffHours, byStaff);
        await db.SaveChangesAsync(ct);

        var dto = await read.BookingAsync(appt, ct);
        return dto;
    }

    public async Task<BookingDto> RescheduleAsync(Guid actorId, string actorRole, Guid bookingId, DateTime newStart, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        var byStaff = Roles.IsStaff(actorRole);
        if (!byStaff && appt.CustomerId != actorId) throw new NotFoundException("Booking");
        if (appt.Status is not (AppointmentStatus.Requested or AppointmentStatus.Confirmed))
            throw new ConflictException("booking_not_reschedulable", "This booking can no longer be moved.");
        Guard.Against(newStart <= clock.UtcNow, "Pick a future time.");
        var length = appt.SlotEnd - appt.SlotStart;

        await CapacityLock.WaitAsync(ct);
        try
        {
            await EnsureCapacityAsync(newStart, newStart + length, appt.Id, ct);
            appt.SlotStart = newStart;
            appt.SlotEnd = newStart + length;
            if (!byStaff) appt.Status = AppointmentStatus.Requested; // customer move needs manager confirmation again
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            CapacityLock.Release();
        }

        var dto = await read.BookingAsync(appt, ct);
        return dto;
    }

    public async Task<IReadOnlyList<BookingDto>> ListForStaffAsync(DateOnly? date, string? status, CancellationToken ct = default)
    {
        var q = db.Appointments.AsNoTracking();
        if (date is { } d)
        {
            var from = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            q = q.Where(a => a.SlotStart >= from && a.SlotStart < from.AddDays(1));
        }
        if (Enum.TryParse<AppointmentStatus>(status, true, out var s)) q = q.Where(a => a.Status == s);
        var rows = await q.OrderBy(a => a.SlotStart).Take(300).ToListAsync(ct);
        var list = new List<BookingDto>();
        foreach (var a in rows) list.Add(await read.BookingAsync(a, ct));
        return list;
    }

    public async Task<IReadOnlyList<BookingDto>> ListForCustomerAsync(Guid customerId, CancellationToken ct = default)
    {
        var rows = await db.Appointments.AsNoTracking().Where(a => a.CustomerId == customerId).OrderByDescending(a => a.SlotStart).ToListAsync(ct);
        var list = new List<BookingDto>();
        foreach (var a in rows) list.Add(await read.BookingAsync(a, ct));
        return list;
    }

    private async Task EnsureCapacityAsync(DateTime start, DateTime end, Guid? ignoreId, CancellationToken ct)
    {
        var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var localStart = workshop.ToLocal(start);
        var localEnd = workshop.ToLocal(end);
        var day = DateOnly.FromDateTime(localStart);
        if (localStart.DayOfWeek == DayOfWeek.Sunday || localStart < day.ToDateTime(workshop.OpenTime) || localEnd > day.ToDateTime(workshop.CloseTime))
            throw new ValidationException("That time is outside opening hours.");
        var bays = await db.Bays.CountAsync(b => b.Active, ct);
        var used = await db.Appointments.CountAsync(a => a.Id != ignoreId && a.SlotStart < end && a.SlotEnd > start &&
            (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed || a.Status == AppointmentStatus.CheckedIn), ct);
        if (used >= bays)
            throw new ConflictException("slot_full", "That slot was just taken. Please pick another time."); // 409 → app refreshes slots
    }
}
