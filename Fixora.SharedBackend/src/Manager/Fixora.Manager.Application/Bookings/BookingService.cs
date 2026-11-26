using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Bookings;

public sealed record ConfirmBookingRequest(Guid BayId, Guid MechanicId, string? Note);
public sealed record DeclineBookingRequest(string Reason);
public sealed record RescheduleRequest(DateTime SlotStart);
public sealed record WalkInRequest(Guid? CustomerId, string CustomerName, Guid? VehicleId, string VehicleLabel, Guid ServiceId, Guid BayId, Guid MechanicId, int Priority, string? Complaint);

/// <summary>Customer → Manager → (Customer + Mechanic) booking flow with server-side capacity (USP 5).</summary>
public sealed class BookingService(
    IManagerDb db,
    WorkshopReadModel read,
    INotificationService notifier,
    QueueService queue,
    ICustomerDirectory customers,
    IMechanicDirectory mechanics,
    IClock clock)
{
    // One branch, one API instance: a process-wide lock makes the capacity check + insert atomic.
    private static readonly SemaphoreSlim CapacityLock = new(1, 1);

    public const int ManagerNoteMaxLength = 500;
    public const int MaxPageSize = 100;

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

        if (appt.SuggestionId is { } sid) await customers.MarkSuggestionBookedAsync(sid, appt.Id, ct);

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.BookingRequested,
                "New booking request",
                $"{customerName} · {vehicleLabel} · {service.Name} · {LocalTime.Format(appt.SlotStart)}",
                "booking", appt.Id, null,
                new Dictionary<string, string> { ["route"] = "bookings" }),
            new[] { Recipient.AllStaff() }, ct);
        var dto = await read.BookingAsync(appt, ct);
        await notifier.PublishAsync(RealtimeEvents.BookingUpdated, dto, new[] { RealtimeGroups.Staff }, ct);
        return dto;
    }

    public async Task<BookingDto> ConfirmAsync(Guid staffId, Guid bookingId, ConfirmBookingRequest req, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        var note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        Guard.Against(note is { Length: > ManagerNoteMaxLength }, $"The note can be at most {ManagerNoteMaxLength} characters.");
        await EnsureActiveBayAsync(req.BayId, ct);
        // Future booking: the mechanic must exist and be employed (Active). On-duty is NOT required (decision for BT03).
        await EnsureMechanicAsync(req.MechanicId, requireOnDuty: false, ct);

        await CapacityLock.WaitAsync(ct); // check + save as one step, so two managers cannot double-book (F02)
        try
        {
            await EnsureResourcesFreeAsync(req.MechanicId, req.BayId, appt.SlotStart, appt.SlotEnd, appt.Id, ct);
            appt.Confirm(req.BayId, req.MechanicId, clock.UtcNow);
            appt.ManagerNote = note;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            CapacityLock.Release();
        }

        var dto = await read.BookingAsync(appt, ct);
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.BookingConfirmed,
                "Booking confirmed",
                $"{appt.ServiceName} on {LocalTime.Format(appt.SlotStart)} · {dto.BayName}. Mechanic: {dto.MechanicName}.",
                "booking", appt.Id),
            new[] { Recipient.User(Roles.Customer, appt.CustomerId) }, ct);
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.JobAssigned,
                "New booking assigned to you",
                $"{appt.VehicleLabel} · {appt.ServiceName} · {LocalTime.Format(appt.SlotStart)} · {dto.BayName}" + (note is null ? "" : $" · Manager: {note}"),
                "booking", appt.Id),
            new[] { Recipient.User(Roles.Mechanic, req.MechanicId) }, ct);
        await PublishAsync(dto, ct);
        return dto;
    }

    public async Task<BookingDto> DeclineAsync(Guid staffId, Guid bookingId, string reason, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        appt.Decline(reason, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.BookingDeclined, "Booking could not be accepted", $"{appt.ServiceName} on {LocalTime.Format(appt.SlotStart)}: {reason}", "booking", appt.Id),
            new[] { Recipient.User(Roles.Customer, appt.CustomerId) }, ct);
        var dto = await read.BookingAsync(appt, ct);
        await PublishAsync(dto, ct);
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

        var msg = new NotificationMessage(NotificationTypes.BookingCancelled, "Booking cancelled",
            $"{appt.CustomerName} · {appt.ServiceName} on {LocalTime.Format(appt.SlotStart)}", "booking", appt.Id);
        var to = new List<Recipient> { byStaff ? Recipient.User(Roles.Customer, appt.CustomerId) : Recipient.AllStaff() };
        if (appt.MechanicId is { } m) to.Add(Recipient.User(Roles.Mechanic, m));
        await notifier.NotifyAsync(msg, to, ct);
        var dto = await read.BookingAsync(appt, ct);
        await PublishAsync(dto, ct);
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
            if (byStaff && appt.Status == AppointmentStatus.Confirmed)
                await EnsureResourcesFreeAsync(appt.MechanicId, appt.BayId, newStart, newStart + length, appt.Id, ct);
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
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.BookingRequested, "Booking moved", $"{appt.CustomerName} · {appt.ServiceName} → {LocalTime.Format(newStart)}", "booking", appt.Id),
            new[] { byStaff ? Recipient.User(Roles.Customer, appt.CustomerId) : Recipient.AllStaff() }, ct);
        await PublishAsync(dto, ct);
        return dto;
    }

    /// <summary>Vehicle arrived: the confirmed booking becomes a job card in today's queue.</summary>
    public async Task<BookingDto> CheckInAsync(Guid staffId, Guid bookingId, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        if (appt.Status != AppointmentStatus.Confirmed) throw new ConflictException("booking_not_confirmed", "Confirm the booking before check-in.");
        var job = await CreateJobAsync(appt, ct);
        appt.Status = AppointmentStatus.CheckedIn;
        appt.JobCardId = job.Id;
        await db.SaveChangesAsync(ct);
        await AfterJobCreatedAsync(job, ct);
        var dto = await read.BookingAsync(appt, ct);
        await PublishAsync(dto, ct);
        return dto;
    }

    /// <summary>Walk-in inserted by the manager; ETAs of everyone behind it move (BR-AQ-05).</summary>
    public async Task<JobSummaryDto> WalkInAsync(Guid staffId, WalkInRequest req, CancellationToken ct = default)
    {
        Guard.Against(!JobPriority.IsValid(req.Priority), JobPriority.Message);
        Guard.Against(string.IsNullOrWhiteSpace(req.CustomerName), "Enter the customer's name.");
        Guard.Against(string.IsNullOrWhiteSpace(req.VehicleLabel), "Enter the vehicle.");
        var service = await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.ServiceId, ct) ?? throw new NotFoundException("Service");
        await EnsureActiveBayAsync(req.BayId, ct);
        // Walk-in work starts now, so the mechanic must also be on duty.
        await EnsureMechanicAsync(req.MechanicId, requireOnDuty: true, ct);
        var now = clock.UtcNow;
        var appt = new Appointment
        {
            CustomerId = req.CustomerId ?? Guid.Empty,
            CustomerName = req.CustomerName,
            VehicleId = req.VehicleId ?? Guid.Empty,
            VehicleLabel = req.VehicleLabel,
            ServiceId = service.Id,
            ServiceName = service.Name,
            SlotStart = now,
            SlotEnd = now.AddMinutes(service.StandardMinutes),
            Status = AppointmentStatus.CheckedIn,
            Source = BookingSource.WalkIn,
            BayId = req.BayId,
            MechanicId = req.MechanicId,
            Notes = req.Complaint,
            CreatedAt = now,
            DecidedAt = now,
        };
        db.Appointments.Add(appt);
        var job = await CreateJobAsync(appt, ct);
        job.Priority = req.Priority;
        appt.JobCardId = job.Id;
        await db.SaveChangesAsync(ct);
        await AfterJobCreatedAsync(job, ct);
        return await read.JobAsync(job, ct);
    }

    public async Task<BookingDto> MarkNoShowAsync(Guid bookingId, CancellationToken ct = default)
    {
        var appt = await db.Appointments.FirstOrDefaultAsync(a => a.Id == bookingId, ct) ?? throw new NotFoundException("Booking");
        if (appt.Status != AppointmentStatus.Confirmed) throw new ConflictException("booking_not_confirmed", "Only confirmed bookings can be marked as no-show.");
        appt.Status = AppointmentStatus.NoShow;
        await db.SaveChangesAsync(ct);
        var dto = await read.BookingAsync(appt, ct);
        await PublishAsync(dto, ct);
        return dto;
    }

    /// <param name="date">The workshop's LOCAL calendar date (Sri Lanka), converted to a UTC range (audit F06).</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">1..100, default 50 (audit F07).</param>
    public async Task<PagedResult<BookingDto>> ListForStaffAsync(DateOnly? date, string? status, int page = 1, int pageSize = 50, CancellationToken ct = default)
    {
        Guard.Against(page < 1, "Page starts at 1.");
        Guard.Against(pageSize is < 1 or > MaxPageSize, $"Page size must be between 1 and {MaxPageSize}.");
        var q = db.Appointments.AsNoTracking();
        if (date is { } d)
        {
            var workshop = await db.Workshops.AsNoTracking().FirstAsync(ct);
            var fromUtc = workshop.ToUtc(d.ToDateTime(TimeOnly.MinValue));
            var toUtc = workshop.ToUtc(d.AddDays(1).ToDateTime(TimeOnly.MinValue));
            q = q.Where(a => a.SlotStart >= fromUtc && a.SlotStart < toUtc);
        }
        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            Guard.Against(!Enum.TryParse<AppointmentStatus>(status, true, out var st), $"Unknown status '{status}'.");
            q = q.Where(a => a.Status == st);
        }
        var total = await q.CountAsync(ct);
        var rows = await q.OrderBy(a => a.SlotStart).ThenBy(a => a.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var list = new List<BookingDto>();
        foreach (var a in rows) list.Add(await read.BookingAsync(a, ct));
        return new PagedResult<BookingDto>(list, page, pageSize, total);
    }

    public async Task<IReadOnlyList<BookingDto>> ListForCustomerAsync(Guid customerId, CancellationToken ct = default)
    {
        var rows = await db.Appointments.AsNoTracking().Where(a => a.CustomerId == customerId).OrderByDescending(a => a.SlotStart).ToListAsync(ct);
        var list = new List<BookingDto>();
        foreach (var a in rows) list.Add(await read.BookingAsync(a, ct));
        return list;
    }

    private async Task EnsureActiveBayAsync(Guid bayId, CancellationToken ct)
    {
        var bay = await db.Bays.AsNoTracking().FirstOrDefaultAsync(b => b.Id == bayId, ct);
        Guard.Against(bay is null, "That bay does not exist.");
        Guard.Against(!bay!.Active, "That bay is not active. Pick an active bay.");
    }

    private async Task<MechanicSummary> EnsureMechanicAsync(Guid mechanicId, bool requireOnDuty, CancellationToken ct)
    {
        var m = await mechanics.GetAsync(mechanicId, ct);
        Guard.Against(m is null, "That mechanic does not exist.");
        Guard.Against(!m!.Active, $"{m.Name} is not an active mechanic.");
        Guard.Against(requireOnDuty && !m.OnDuty, $"{m.Name} is off duty. Pick a mechanic who is on duty.");
        return m;
    }

    /// <summary>
    /// Audit F02: one mechanic and one bay cannot hold two confirmed / checked-in bookings at the same time.
    /// Call inside <see cref="CapacityLock"/> together with the save.
    /// </summary>
    private async Task EnsureResourcesFreeAsync(Guid? mechanicId, Guid? bayId, DateTime start, DateTime end, Guid ignoreId, CancellationToken ct)
    {
        var busy = db.Appointments.AsNoTracking().Where(a => a.Id != ignoreId && a.SlotStart < end && a.SlotEnd > start &&
            (a.Status == AppointmentStatus.Confirmed || a.Status == AppointmentStatus.CheckedIn));
        if (mechanicId is { } m)
        {
            var clash = await busy.Where(a => a.MechanicId == m).OrderBy(a => a.SlotStart).FirstOrDefaultAsync(ct);
            if (clash is not null)
                throw new ConflictException("mechanic_busy",
                    $"{await read.MechanicNameAsync(m, ct) ?? "This mechanic"} is already booked {LocalTime.Format(clash.SlotStart)}–{LocalTime.Format(clash.SlotEnd)}.");
        }
        if (bayId is { } b)
        {
            var clash = await busy.Where(a => a.BayId == b).OrderBy(a => a.SlotStart).FirstOrDefaultAsync(ct);
            if (clash is not null)
                throw new ConflictException("bay_busy",
                    $"{await read.BayNameAsync(b, ct) ?? "This bay"} is already booked {LocalTime.Format(clash.SlotStart)}–{LocalTime.Format(clash.SlotEnd)}.");
        }
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

    private async Task<JobCard> CreateJobAsync(Appointment appt, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var service = await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Id == appt.ServiceId, ct);
        var order = (await db.JobCards.MaxAsync(j => (int?)j.QueueOrder, ct) ?? 0) + 1;
        var job = JobNumbers.NewJob(appt, await JobNumbers.NextJobNumberAsync(db, now, ct), service?.StandardMinutes ?? 60, order, now);
        db.JobCards.Add(job);
        db.ProgressUpdates.Add(new ProgressUpdate { JobCardId = job.Id, Stage = "Checked in", Message = "Vehicle received at the workshop.", Percent = 5, ActorRole = Roles.Manager, At = now });
        return job;
    }

    private async Task AfterJobCreatedAsync(JobCard job, CancellationToken ct)
    {
        if (job.MechanicId is { } mech)
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.JobAssigned, "Vehicle in your queue", $"{job.Number} · {job.VehicleLabel} · {job.Complaint}", "job", job.Id, job.Id,
                    new Dictionary<string, string> { ["route"] = "job", ["jobId"] = job.Id.ToString() }),
                new[] { Recipient.User(Roles.Mechanic, mech) }, ct);
        if (job.CustomerId != Guid.Empty)
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.JobProgress, "Vehicle checked in", $"{job.VehicleLabel} is in the queue. Track it live in the app.", "job", job.Id, job.Id),
                new[] { Recipient.User(Roles.Customer, job.CustomerId) }, ct);
        await queue.RecalculateAsync(ct);
    }

    private Task PublishAsync(BookingDto dto, CancellationToken ct)
    {
        return PublishSplitAsync(dto, ct);
    }

    private async Task PublishSplitAsync(BookingDto dto, CancellationToken ct)
    {
        var groups = new List<string> { RealtimeGroups.Staff };
        if (dto.MechanicId is { } m) groups.Add(RealtimeGroups.User(m));
        await notifier.PublishAsync(RealtimeEvents.BookingUpdated, dto, groups, ct);
        if (dto.CustomerId != Guid.Empty)
            await notifier.PublishAsync(RealtimeEvents.BookingUpdated, dto.ForCustomer(), new[] { RealtimeGroups.User(dto.CustomerId) }, ct);
    }
}
