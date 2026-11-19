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
/// FX13-D04-NID-1: CURRENT IMPLEMENTATION characterization of booking → job linkage.
/// Documents Confirm vs CheckIn/WalkIn behaviour as coded today.
/// These tests do NOT prove the draft contract rule "Confirmation creates or links exactly one job".
/// Product decision (job on Confirm vs CheckIn) remains unresolved.
/// </summary>
public sealed class BookingConfirmCheckInJobLinkageTests
{
    private static readonly DateTime Now =
        new(2026, 11, 16, 3, 0, 0, DateTimeKind.Utc);

    /// <summary>Local 10:30 → 05:00 UTC.</summary>
    private static readonly DateTime SlotA =
        new(2026, 11, 16, 5, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class CapturingNotifier : INotificationService
    {
        public List<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> Notifications { get; } = new();

        public List<(string EventName, object Payload, IReadOnlyList<string> Groups)> Publishes { get; } = new();

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
        {
            Publishes.Add((eventName, payload, groups.ToList()));
            return Task.CompletedTask;
        }
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
    }

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"booking-confirm-checkin-{Guid.NewGuid():N}")
            .Options;
        return new ManagerDbContext(options);
    }

    private static Harness CreateHarness(ManagerDbContext db)
    {
        var clock = new TestClock();
        var notifier = new CapturingNotifier();
        var read = new WorkshopReadModel(db, new EmptyMechanicDirectory(), new StubMedia(), clock);
        var queue = new QueueService(db, notifier, read, clock);
        var bookings = new BookingService(db, read, notifier, queue, new StubCustomers(), clock);
        return new Harness { Db = db, Bookings = bookings, Notifier = notifier };
    }

    private static void EnsureWorkshop(ManagerDbContext db)
    {
        if (db.Workshops.Any())
        {
            return;
        }

        db.Workshops.Add(new Workshop
        {
            Name = "NID-1 Job Linkage Garage",
            OpenTime = new TimeOnly(8, 0),
            CloseTime = new TimeOnly(18, 0),
            SlotMinutes = 60,
            UtcOffsetMinutes = 330
        });
        db.SaveChanges();
    }

    private static Bay SeedBay(ManagerDbContext db)
    {
        EnsureWorkshop(db);
        var bay = new Bay { Name = "Bay 1", Active = true, SortOrder = 1 };
        db.Bays.Add(bay);
        db.SaveChanges();
        return bay;
    }

    private static ServiceItem SeedService(ManagerDbContext db)
    {
        EnsureWorkshop(db);
        var service = new ServiceItem
        {
            Name = "General Service",
            StandardMinutes = 60,
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
        string idempotencyKey)
    {
        return await harness.Bookings.RequestAsync(
            customerId,
            "Customer A",
            "Toyota Aqua",
            new BookingRequest(Guid.NewGuid(), service.Id, SlotA, "Brake noise", null, null),
            idempotencyKey);
    }

    private static IEnumerable<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> OfType(
        CapturingNotifier notifier,
        string type)
        => notifier.Notifications.Where(n => n.Message.Type == type);

    /// <summary>
    /// CURRENT IMPLEMENTATION: Confirm does not create a JobCard; JobCardId stays null.
    /// Not proof of draft "confirmation creates a job".
    /// </summary>
    [Fact]
    public async Task Current_Confirm_leaves_booking_without_JobCard_or_JobCardId()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-confirm-no-job");
        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        var dto = await harness.Bookings.ConfirmAsync(
            Guid.NewGuid(),
            booking.Id,
            new ConfirmBookingRequest(bay.Id, mechanicId, null));

        Assert.Equal(nameof(AppointmentStatus.Confirmed), dto.Status);
        Assert.Null(dto.JobCardId);
        Assert.Equal(0, await db.JobCards.CountAsync());
        Assert.Null(
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).JobCardId);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: Confirm notifies on booking ids, not job ids.
    /// </summary>
    [Fact]
    public async Task Current_Confirm_emits_booking_scoped_notifications_and_booking_updated()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-confirm-notify");
        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        await harness.Bookings.ConfirmAsync(
            Guid.NewGuid(),
            booking.Id,
            new ConfirmBookingRequest(bay.Id, mechanicId, null));

        var confirmed = Assert.Single(OfType(harness.Notifier, NotificationTypes.BookingConfirmed));
        Assert.Equal("booking", confirmed.Message.EntityType);
        Assert.Equal(booking.Id, confirmed.Message.EntityId);
        Assert.Null(confirmed.Message.JobId);
        Assert.Contains(confirmed.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);

        var assigned = Assert.Single(OfType(harness.Notifier, NotificationTypes.JobAssigned));
        Assert.Equal("booking", assigned.Message.EntityType);
        Assert.Equal(booking.Id, assigned.Message.EntityId);
        Assert.Null(assigned.Message.JobId);
        Assert.Contains(assigned.Recipients, r => r.Role == Roles.Mechanic && r.UserId == mechanicId);

        var bookingUpdated = Assert.Single(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.BookingUpdated);
        var payload = Assert.IsType<BookingDto>(bookingUpdated.Payload);
        Assert.Equal(booking.Id, payload.Id);
        Assert.Null(payload.JobCardId);
        Assert.Equal(nameof(AppointmentStatus.Confirmed), payload.Status);
        Assert.Contains(RealtimeGroups.Staff, bookingUpdated.Groups);
        Assert.Contains(RealtimeGroups.User(customerId), bookingUpdated.Groups);
        Assert.Contains(RealtimeGroups.User(mechanicId), bookingUpdated.Groups);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: CheckIn creates exactly one linked JobCard.
    /// </summary>
    [Fact]
    public async Task Current_CheckIn_creates_one_JobCard_linked_by_AppointmentId_and_JobCardId()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-checkin-link");
        await harness.Bookings.ConfirmAsync(
            staffId,
            booking.Id,
            new ConfirmBookingRequest(bay.Id, mechanicId, null));
        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        var dto = await harness.Bookings.CheckInAsync(staffId, booking.Id);

        Assert.Equal(nameof(AppointmentStatus.CheckedIn), dto.Status);
        Assert.NotNull(dto.JobCardId);

        Assert.Equal(1, await db.JobCards.CountAsync());
        var job = await db.JobCards.AsNoTracking().SingleAsync();
        Assert.Equal(booking.Id, job.AppointmentId);
        Assert.Equal(dto.JobCardId, job.Id);
        Assert.Equal(customerId, job.CustomerId);
        Assert.Equal(mechanicId, job.MechanicId);
        Assert.Equal(bay.Id, job.BayId);

        var appt = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id);
        Assert.Equal(job.Id, appt.JobCardId);
        Assert.Equal(AppointmentStatus.CheckedIn, appt.Status);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: job + booking link are saved before job-scoped notifications.
    /// </summary>
    [Fact]
    public async Task Current_CheckIn_persists_job_link_before_customer_and_mechanic_job_notifications()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-checkin-order");
        await harness.Bookings.ConfirmAsync(
            staffId,
            booking.Id,
            new ConfirmBookingRequest(bay.Id, mechanicId, null));
        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        Guid? linkedJobId = null;
        var persistedBeforeNotify = false;
        harness.Notifier.OnNotifyAsync = async () =>
        {
            var appt = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id);
            var jobs = await db.JobCards.AsNoTracking().ToListAsync();
            if (appt.JobCardId is Guid jobId &&
                jobs.Count == 1 &&
                jobs[0].Id == jobId &&
                jobs[0].AppointmentId == booking.Id)
            {
                linkedJobId = jobId;
                persistedBeforeNotify = true;
            }
        };

        var dto = await harness.Bookings.CheckInAsync(staffId, booking.Id);

        Assert.True(
            persistedBeforeNotify,
            "CheckIn job notifications must run only after JobCard and JobCardId are saved.");
        Assert.Equal(linkedJobId, dto.JobCardId);

        var mechanicNotify = Assert.Single(
            OfType(harness.Notifier, NotificationTypes.JobAssigned),
            n => n.Message.EntityType == "job");
        Assert.Equal(dto.JobCardId, mechanicNotify.Message.EntityId);
        Assert.Equal(dto.JobCardId, mechanicNotify.Message.JobId);
        Assert.Contains(mechanicNotify.Recipients, r => r.Role == Roles.Mechanic && r.UserId == mechanicId);

        var customerNotify = Assert.Single(OfType(harness.Notifier, NotificationTypes.JobProgress));
        Assert.Equal("job", customerNotify.Message.EntityType);
        Assert.Equal(dto.JobCardId, customerNotify.Message.EntityId);
        Assert.Equal(dto.JobCardId, customerNotify.Message.JobId);
        Assert.Contains(customerNotify.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);

        var bookingUpdated = Assert.Single(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.BookingUpdated &&
                 p.Payload is BookingDto b &&
                 b.Status == nameof(AppointmentStatus.CheckedIn));
        var payload = Assert.IsType<BookingDto>(bookingUpdated.Payload);
        Assert.Equal(booking.Id, payload.Id);
        Assert.Equal(dto.JobCardId, payload.JobCardId);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: repeating CheckIn is rejected; no second JobCard.
    /// </summary>
    [Fact]
    public async Task Current_repeat_CheckIn_does_not_create_another_job()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var staffId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-checkin-repeat");
        await harness.Bookings.ConfirmAsync(
            staffId,
            booking.Id,
            new ConfirmBookingRequest(bay.Id, Guid.NewGuid(), null));
        var first = await harness.Bookings.CheckInAsync(staffId, booking.Id);
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.CheckInAsync(staffId, booking.Id));

        Assert.Equal("booking_not_confirmed", ex.Code);
        Assert.Equal(1, await db.JobCards.CountAsync());
        Assert.Equal(
            first.JobCardId,
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).JobCardId);
        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.JobProgress);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: CheckIn before Confirm is rejected by status rule.
    /// </summary>
    [Fact]
    public async Task Current_CheckIn_before_Confirm_is_rejected()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var harness = CreateHarness(db);

        var booking = await RequestAsync(harness, customerId, service, "idem-checkin-early");
        harness.Notifier.Notifications.Clear();

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Bookings.CheckInAsync(Guid.NewGuid(), booking.Id));

        Assert.Equal("booking_not_confirmed", ex.Code);
        Assert.Equal(0, await db.JobCards.CountAsync());
        Assert.Null(
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).JobCardId);
        Assert.Equal(
            AppointmentStatus.Requested,
            (await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == booking.Id)).Status);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION: WalkIn creates and links a JobCard immediately.
    /// </summary>
    [Fact]
    public async Task Current_WalkIn_immediately_creates_and_links_JobCard()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db);
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var harness = CreateHarness(db);
        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        var jobSummary = await harness.Bookings.WalkInAsync(
            Guid.NewGuid(),
            new WalkInRequest(
                customerId,
                "Walk-in Customer",
                Guid.NewGuid(),
                "Honda Fit",
                service.Id,
                bay.Id,
                mechanicId,
                Priority: 1,
                Complaint: "Strange noise"));

        Assert.Equal(1, await db.JobCards.CountAsync());
        var job = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == jobSummary.Id);
        Assert.NotNull(job.AppointmentId);

        var appt = await db.Appointments.AsNoTracking().SingleAsync(a => a.Id == job.AppointmentId);
        Assert.Equal(AppointmentStatus.CheckedIn, appt.Status);
        Assert.Equal(job.Id, appt.JobCardId);
        Assert.Equal(BookingSource.WalkIn, appt.Source);
        Assert.Equal(1, job.Priority);

        var mechanicNotify = Assert.Single(
            OfType(harness.Notifier, NotificationTypes.JobAssigned),
            n => n.Message.EntityType == "job");
        Assert.Equal(job.Id, mechanicNotify.Message.JobId);

        var customerNotify = Assert.Single(OfType(harness.Notifier, NotificationTypes.JobProgress));
        Assert.Equal(job.Id, customerNotify.Message.JobId);
        Assert.Contains(customerNotify.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);
    }
}
