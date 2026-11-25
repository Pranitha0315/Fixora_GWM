using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Tests.Domain;

/// <summary>
/// FX13-D04-NID-2: booking cancel / reschedule / notification / capacity rules (tests only).
/// Covers process-level BookingService behaviour with EF InMemory.
/// Does not claim SQL isolation or multi-instance database locking.
/// </summary>
public sealed class BookingRescheduleCancelConcurrencyTests
{
    /// <summary>Monday 03:00 UTC → 08:30 local (UTC+5:30), inside open hours for later slots.</summary>
    private static readonly DateTime Now =
        new(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc);

    /// <summary>Local 10:30 → 05:00 UTC.</summary>
    private static readonly DateTime SlotA =
        new(2026, 11, 16, 5, 0, 0, DateTimeKind.Utc);

    /// <summary>Local 11:30 → 06:00 UTC.</summary>
    private static readonly DateTime SlotB =
        new(2026, 11, 16, 6, 0, 0, DateTimeKind.Utc);

    /// <summary>Local 12:30 → 07:00 UTC.</summary>
    private static readonly DateTime SlotC =
        new(2026, 11, 16, 7, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class CapturingNotifier : INotificationService
    {
        public List<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> Notifications { get; } = new();

        public Func<Task>? OnNotifyAsync { get; set; }

        public async Task NotifyAsync(
            NotificationMessage message,
            IEnumerable<Recipient> recipients,
            CancellationToken ct = default)
        {
            if (OnNotifyAsync is not null)
            {
                await OnNotifyAsync();
            }

            Notifications.Add((message, recipients.ToList()));
        }

        public Task PublishAsync(
            string eventName,
            object payload,
            IEnumerable<string> groups,
            CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private sealed class StubMedia : IMediaStorage
    {
        public Task<StoredMedia> SaveAsync(
            Stream content,
            string contentType,
            string fileName,
            CancellationToken ct = default)
            => throw new NotSupportedException();

        public string GetSignedUrl(string mediaRef, TimeSpan ttl) => mediaRef;
    }

    private sealed class StubCustomers : ICustomerDirectory
    {
        public Task<CustomerSummary?> GetCustomerAsync(Guid customerId, CancellationToken ct = default)
            => Task.FromResult<CustomerSummary?>(null);

        public Task<IReadOnlyDictionary<Guid, CustomerSummary>> GetCustomersAsync(
            IEnumerable<Guid> ids,
            CancellationToken ct = default)
            => Task.FromResult<IReadOnlyDictionary<Guid, CustomerSummary>>(
                new Dictionary<Guid, CustomerSummary>());

        public Task<VehicleSummary?> GetVehicleAsync(Guid vehicleId, CancellationToken ct = default)
            => Task.FromResult<VehicleSummary?>(null);

        public Task<DriveSenseHintDto?> GetDriveSenseHintAsync(Guid vehicleId, CancellationToken ct = default)
            => Task.FromResult<DriveSenseHintDto?>(null);

        public Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<CustomerSummary>>(Array.Empty<CustomerSummary>());

        public Task MarkSuggestionBookedAsync(
            Guid suggestionId,
            Guid appointmentId,
            CancellationToken ct = default)
            => Task.CompletedTask;

        public Task<LoyaltyRedemption> RedeemForInvoiceAsync(
            Guid customerId,
            decimal invoiceSubtotal,
            decimal percent,
            decimal cap,
            string invoiceNumber,
            CancellationToken ct = default)
            => Task.FromResult(new LoyaltyRedemption(0, 0));

        public Task AwardSpendPointsAsync(
            Guid customerId,
            decimal paidAmount,
            string invoiceNumber,
            CancellationToken ct = default)
            => Task.CompletedTask;

        public Task<IReadOnlyList<RoadStressCellDto>> GetRoadStressAsync(int days, CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<RoadStressCellDto>>(Array.Empty<RoadStressCellDto>());
    }

    private sealed class EmptyMechanicDirectory : IMechanicDirectory
    {
        public Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default)
            => Task.FromResult<MechanicSummary?>(
                new MechanicSummary(mechanicId, "Mech", "0770000000", "EMP-1", true, true));

        public Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MechanicSummary>>(Array.Empty<MechanicSummary>());
    }

    private sealed class Harness
    {
        public required ManagerDbContext Db { get; init; }
        public required BookingService Bookings { get; init; }
        public required CapturingNotifier Notifier { get; init; }
        public required TestClock Clock { get; init; }
    }

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"booking-rsc-{Guid.NewGuid():N}")
            .Options;
        return new ManagerDbContext(options);
    }

    private static Harness CreateHarness(ManagerDbContext db)
    {
        var clock = new TestClock();
        var notifier = new CapturingNotifier();
        var read = new WorkshopReadModel(db, new EmptyMechanicDirectory(), new StubMedia(), clock);
        var queue = new QueueService(db, notifier, read, clock);
        var bookings = new BookingService(db, read, notifier, queue, new StubCustomers(), new EmptyMechanicDirectory(), clock);
        return new Harness
        {
            Db = db,
            Bookings = bookings,
            Notifier = notifier,
            Clock = clock
        };
    }

    private static Workshop EnsureWorkshop(ManagerDbContext db, int cancelCutoffHours = 2)
    {
        var existing = db.Workshops.FirstOrDefault();
        if (existing is not null)
        {
            existing.CancelCutoffHours = cancelCutoffHours;
            db.SaveChanges();
            return existing;
        }

        var workshop = new Workshop
        {
            Name = "NID-4 Booking Test Garage",
            CancelCutoffHours = cancelCutoffHours,
            OpenTime = new TimeOnly(8, 0),
            CloseTime = new TimeOnly(18, 0),
            SlotMinutes = 60,
            UtcOffsetMinutes = 330
        };
        db.Workshops.Add(workshop);
        db.SaveChanges();
        return workshop;
    }

    private static Bay SeedBay(ManagerDbContext db, string name = "Bay 1")
    {
        EnsureWorkshop(db);
        var bay = new Bay { Name = name, Active = true, SortOrder = 1 };
        db.Bays.Add(bay);
        db.SaveChanges();
        return bay;
    }

    private static ServiceItem SeedService(ManagerDbContext db, int standardMinutes = 60)
    {
        EnsureWorkshop(db);
        var service = new ServiceItem
        {
            Name = "General Service",
            StandardMinutes = standardMinutes,
            Active = true,
            BasePrice = 5000m
        };
        db.Services.Add(service);
        db.SaveChanges();
        return service;
    }

    private static async Task<BookingDto> RequestAsync(
        Harness harness,
        Guid customerId,
        ServiceItem service,
        DateTime slotStart,
        string idempotencyKey,
        string customerName = "Customer A",
        string vehicleLabel = "Toyota Aqua")
    {
        return await harness.Bookings.RequestAsync(
            customerId,
            customerName,
            vehicleLabel,
            new BookingRequest(Guid.NewGuid(), service.Id, slotStart, null, null, null),
            idempotencyKey);
    }

    private static IEnumerable<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> OfType(
        CapturingNotifier notifier,
        string type)
        => notifier.Notifications.Where(n => n.Message.Type == type);

    [Fact]
    public async Task Customer_can_cancel_own_requested_booking_and_notifies_staff_after_save()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, SlotA, "idem-cancel-own");
        harness.Notifier.Notifications.Clear();

        var persistedBeforeNotify = false;
        harness.Notifier.OnNotifyAsync = async () =>
        {
            var row = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id);
            persistedBeforeNotify = row.Status == AppointmentStatus.Cancelled;
        };

        var dto = await harness.Bookings.CancelAsync(customerId, Roles.Customer, booking.Id);

        Assert.Equal(nameof(AppointmentStatus.Cancelled), dto.Status);
        Assert.True(persistedBeforeNotify, "Cancel notification must run after Cancelled is saved.");

        var cancelled = Assert.Single(OfType(harness.Notifier, NotificationTypes.BookingCancelled));
        Assert.Contains(cancelled.Recipients, r => r.Role == Recipient.StaffRole && r.UserId is null);
        Assert.Equal(booking.Id, cancelled.Message.EntityId);
    }

    [Fact]
    public async Task Other_customer_cannot_cancel_booking()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var ownerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, ownerId, service, SlotA, "idem-cancel-other");
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<NotFoundException>(
            () => harness.Bookings.CancelAsync(Guid.NewGuid(), Roles.Customer, booking.Id));

        Assert.Equal("not_found", ex.Code);
        Assert.Equal(
            AppointmentStatus.Requested,
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).Status);
        Assert.Empty(OfType(harness.Notifier, NotificationTypes.BookingCancelled));
    }

    [Fact]
    public async Task Staff_can_cancel_confirmed_booking_and_notifies_customer_and_mechanic()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, SlotA, "idem-staff-cancel");
        await harness.Bookings.ConfirmAsync(staffId, booking.Id, new ConfirmBookingRequest(bay.Id, mechanicId, null));
        harness.Notifier.Notifications.Clear();

        var dto = await harness.Bookings.CancelAsync(staffId, Roles.Manager, booking.Id);

        Assert.Equal(nameof(AppointmentStatus.Cancelled), dto.Status);
        var cancelled = Assert.Single(OfType(harness.Notifier, NotificationTypes.BookingCancelled));
        Assert.Contains(cancelled.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);
        Assert.Contains(cancelled.Recipients, r => r.Role == Roles.Mechanic && r.UserId == mechanicId);
    }

    [Fact]
    public async Task Customer_cancel_within_cutoff_is_rejected_while_staff_cancel_succeeds()
    {
        await using var db = CreateDb();
        EnsureWorkshop(db, cancelCutoffHours: 2);
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        // Slot 90 minutes ahead → inside 2-hour customer cutoff.
        var nearSlot = Now.AddMinutes(90);
        var booking = await RequestAsync(harness, customerId, service, nearSlot, "idem-cutoff");
        harness.Notifier.Notifications.Clear();

        var cutoff = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.CancelAsync(customerId, Roles.Customer, booking.Id));
        Assert.Equal("cancel_cutoff", cutoff.Code);
        Assert.Equal(
            AppointmentStatus.Requested,
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).Status);
        Assert.Empty(OfType(harness.Notifier, NotificationTypes.BookingCancelled));

        var dto = await harness.Bookings.CancelAsync(staffId, Roles.Manager, booking.Id);
        Assert.Equal(nameof(AppointmentStatus.Cancelled), dto.Status);
        Assert.Single(OfType(harness.Notifier, NotificationTypes.BookingCancelled));
    }

    [Fact]
    public async Task Terminal_states_cannot_be_cancelled_or_rescheduled()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var declined = await RequestAsync(harness, customerId, service, SlotA, "idem-declined");
        await harness.Bookings.DeclineAsync(Guid.NewGuid(), declined.Id, "No bay");
        harness.Notifier.Notifications.Clear();

        var cancelDeclined = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.CancelAsync(customerId, Roles.Customer, declined.Id));
        Assert.Equal("booking_not_cancellable", cancelDeclined.Code);

        var rescheduleDeclined = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.RescheduleAsync(customerId, Roles.Customer, declined.Id, SlotB));
        Assert.Equal("booking_not_reschedulable", rescheduleDeclined.Code);

        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.BookingCancelled);
        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.BookingRequested &&
                 n.Message.Title == "Booking moved");
    }

    [Fact]
    public async Task Customer_reschedule_moves_slot_and_returns_status_to_requested()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, SlotA, "idem-resched-cust");
        await harness.Bookings.ConfirmAsync(
            staffId,
            booking.Id,
            new ConfirmBookingRequest(bay.Id, Guid.NewGuid(), null));
        harness.Notifier.Notifications.Clear();

        var persistedBeforeNotify = false;
        harness.Notifier.OnNotifyAsync = async () =>
        {
            var row = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id);
            persistedBeforeNotify =
                row.SlotStart == SlotB &&
                row.Status == AppointmentStatus.Requested;
        };

        var dto = await harness.Bookings.RescheduleAsync(customerId, Roles.Customer, booking.Id, SlotB);

        Assert.Equal(SlotB, dto.SlotStart);
        Assert.Equal(nameof(AppointmentStatus.Requested), dto.Status);
        Assert.True(persistedBeforeNotify, "Reschedule notification must run after slot/status persist.");

        var moved = Assert.Single(
            OfType(harness.Notifier, NotificationTypes.BookingRequested),
            n => n.Message.Title == "Booking moved");
        Assert.Contains(moved.Recipients, r => r.Role == Recipient.StaffRole);
    }

    [Fact]
    public async Task Staff_reschedule_keeps_confirmed_and_notifies_customer()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, SlotA, "idem-resched-staff");
        await harness.Bookings.ConfirmAsync(
            staffId,
            booking.Id,
            new ConfirmBookingRequest(bay.Id, Guid.NewGuid(), null));
        harness.Notifier.Notifications.Clear();

        var dto = await harness.Bookings.RescheduleAsync(staffId, Roles.Manager, booking.Id, SlotC);

        Assert.Equal(SlotC, dto.SlotStart);
        Assert.Equal(nameof(AppointmentStatus.Confirmed), dto.Status);

        var moved = Assert.Single(
            OfType(harness.Notifier, NotificationTypes.BookingRequested),
            n => n.Message.Title == "Booking moved");
        Assert.Contains(moved.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);
    }

    [Fact]
    public async Task Reschedule_to_full_slot_rejects_without_mutating_booking_or_notifying()
    {
        await using var db = CreateDb();
        // One active bay → capacity 1 per overlapping window.
        SeedBay(db);
        var service = SeedService(db);
        var customerA = Guid.NewGuid();
        var customerB = Guid.NewGuid();
        var harness = CreateHarness(db);

        var first = await RequestAsync(harness, customerA, service, SlotA, "idem-full-a");
        var second = await RequestAsync(harness, customerB, service, SlotB, "idem-full-b");
        harness.Notifier.Notifications.Clear();

        var before = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == second.Id);

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.RescheduleAsync(customerB, Roles.Customer, second.Id, SlotA));

        Assert.Equal("slot_full", ex.Code);

        var after = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == second.Id);
        Assert.Equal(before.SlotStart, after.SlotStart);
        Assert.Equal(before.SlotEnd, after.SlotEnd);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(first.Id, (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == first.Id)).Id);
        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.BookingRequested &&
                 n.Message.Title == "Booking moved");
    }

    [Fact]
    public async Task Request_into_full_slot_is_rejected_with_slot_full()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var harness = CreateHarness(db);

        await RequestAsync(harness, Guid.NewGuid(), service, SlotA, "idem-cap-1");
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => RequestAsync(harness, Guid.NewGuid(), service, SlotA, "idem-cap-2"));

        Assert.Equal("slot_full", ex.Code);
        Assert.Equal(1, await db.Appointments.CountAsync());
        Assert.Empty(OfType(harness.Notifier, NotificationTypes.BookingRequested));
    }

    [Fact]
    public async Task Request_idempotency_key_returns_same_booking_without_duplicate_row_or_notify()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var first = await RequestAsync(harness, customerId, service, SlotA, "same-key");
        harness.Notifier.Notifications.Clear();

        var second = await RequestAsync(harness, customerId, service, SlotB, "same-key");

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(first.SlotStart, second.SlotStart);
        Assert.Equal(1, await db.Appointments.CountAsync(a => a.CustomerId == customerId));
        Assert.Empty(harness.Notifier.Notifications);
    }

    [Fact]
    public async Task Other_customer_cannot_reschedule_booking()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var ownerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, ownerId, service, SlotA, "idem-resched-other");
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<NotFoundException>(
            () => harness.Bookings.RescheduleAsync(Guid.NewGuid(), Roles.Customer, booking.Id, SlotB));

        Assert.Equal("not_found", ex.Code);
        Assert.Equal(
            SlotA,
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).SlotStart);
        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.BookingRequested &&
                 n.Message.Title == "Booking moved");
    }

    [Fact]
    public async Task Failed_cancel_does_not_emit_booking_cancelled_notification()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, SlotA, "idem-fail-cancel");
        var row = await db.Appointments.SingleAsync(a => a.Id == booking.Id);
        row.Status = AppointmentStatus.CheckedIn;
        await db.SaveChangesAsync();
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.CancelAsync(customerId, Roles.Customer, booking.Id));

        Assert.Equal("booking_not_cancellable", ex.Code);
        Assert.Empty(OfType(harness.Notifier, NotificationTypes.BookingCancelled));
    }
}
