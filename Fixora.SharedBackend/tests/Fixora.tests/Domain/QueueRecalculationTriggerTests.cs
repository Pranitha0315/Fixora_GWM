using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Billing;
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
/// FX13-D05-NID-1: queue recalculation triggers on delays (extend) and walk-ins.
/// Characterizes current BookingService / JobService → QueueService.RecalculateAsync behaviour.
/// </summary>
public sealed class QueueRecalculationTriggerTests
{
    private static readonly DateTime Now =
        new(2026, 11, 20, 4, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class CapturingNotifier : INotificationService
    {
        public List<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> Notifications { get; } = new();

        public List<(string EventName, object Payload, IReadOnlyList<string> Groups)> Publishes { get; } = new();

        public Task NotifyAsync(
            NotificationMessage message,
            IEnumerable<Recipient> recipients,
            CancellationToken ct = default)
        {
            Notifications.Add((message, recipients.ToList()));
            return Task.CompletedTask;
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
        public required JobService Jobs { get; init; }
        public required QueueService Queue { get; init; }
        public required CapturingNotifier Notifier { get; init; }
    }

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"queue-recalc-{Guid.NewGuid():N}")
            .Options;
        return new ManagerDbContext(options);
    }

    private static Harness CreateHarness(ManagerDbContext db)
    {
        var clock = new TestClock();
        var notifier = new CapturingNotifier();
        var customers = new StubCustomers();
        var mechanics = new EmptyMechanicDirectory();
        var read = new WorkshopReadModel(db, mechanics, new StubMedia(), clock);
        var queue = new QueueService(db, notifier, read, clock);
        var billing = new BillingService(db, customers, notifier, clock);
        var jobs = new JobService(db, read, notifier, queue, billing, mechanics, clock);
        var bookings = new BookingService(db, read, notifier, queue, customers, clock);
        return new Harness
        {
            Db = db,
            Bookings = bookings,
            Jobs = jobs,
            Queue = queue,
            Notifier = notifier
        };
    }

    private static Workshop EnsureWorkshop(ManagerDbContext db, int etaShiftNotifyMinutes = 20)
    {
        var existing = db.Workshops.FirstOrDefault();
        if (existing is not null)
        {
            existing.EtaShiftNotifyMinutes = etaShiftNotifyMinutes;
            db.SaveChanges();
            return existing;
        }

        var workshop = new Workshop
        {
            Name = "NID-5 Queue Trigger Garage",
            OpenTime = new TimeOnly(8, 0),
            CloseTime = new TimeOnly(18, 0),
            SlotMinutes = 60,
            UtcOffsetMinutes = 330,
            EtaShiftNotifyMinutes = etaShiftNotifyMinutes
        };
        db.Workshops.Add(workshop);
        db.SaveChanges();
        return workshop;
    }

    private static Bay SeedBay(ManagerDbContext db)
    {
        EnsureWorkshop(db);
        var bay = new Bay { Name = "Bay 1", Active = true, SortOrder = 1 };
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

    private static JobCard SeedOpenJob(
        ManagerDbContext db,
        Guid customerId,
        int queueOrder,
        int estimatedMinutes,
        Guid? bayId = null,
        Guid? mechanicId = null,
        int priority = 0,
        string vehicleLabel = "Booked Car")
    {
        EnsureWorkshop(db);
        var job = new JobCard
        {
            Number = $"JC-Q-{Guid.NewGuid():N}"[..16],
            CustomerId = customerId,
            CustomerName = "Queue Customer",
            VehicleId = Guid.NewGuid(),
            VehicleLabel = vehicleLabel,
            MechanicId = mechanicId,
            BayId = bayId,
            Status = JobStatus.Open,
            Complaint = "Queue fixture",
            EstimatedMinutes = estimatedMinutes,
            Priority = priority,
            QueueOrder = queueOrder,
            CreatedAt = Now.AddMinutes(-queueOrder * 5)
        };
        db.JobCards.Add(job);
        db.SaveChanges();
        return job;
    }

    [Fact]
    public async Task WalkIn_recalculates_queue_and_moves_later_open_job()
    {
        await using var db = CreateDb();
        var bay = SeedBay(db);
        var service = SeedService(db, standardMinutes: 45);
        var bookedCustomer = Guid.NewGuid();
        var booked = SeedOpenJob(
            db,
            bookedCustomer,
            queueOrder: 1,
            estimatedMinutes: 60,
            bayId: bay.Id,
            mechanicId: Guid.NewGuid(),
            vehicleLabel: "Booked Axio");
        var harness = CreateHarness(db);

        await harness.Queue.RecalculateAsync();
        var before = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == booked.Id);
        Assert.Equal(1, before.QueuePosition);
        Assert.NotNull(before.EtaAt);

        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        var walkIn = await harness.Bookings.WalkInAsync(
            Guid.NewGuid(),
            new WalkInRequest(
                Guid.NewGuid(),
                "Walk-in Guest",
                Guid.NewGuid(),
                "Honda Fit",
                service.Id,
                bay.Id,
                Guid.NewGuid(),
                Priority: 1,
                Complaint: "Strange noise"));

        Assert.Equal(1, walkIn.Priority);

        var afterBooked = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == booked.Id);
        var walkInJob = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == walkIn.Id);

        Assert.Equal(1, walkInJob.QueuePosition);
        Assert.Equal(2, afterBooked.QueuePosition);
        Assert.True(
            afterBooked.EtaAt > before.EtaAt,
            "Walk-in with higher priority must push the booked job's indicative ETA later.");

        Assert.Contains(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.QueueUpdated &&
                 p.Groups.Contains(RealtimeGroups.Staff));
        Assert.Contains(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.QueueUpdated &&
                 p.Groups.Contains(RealtimeGroups.Role(Roles.Mechanic)));
        Assert.Contains(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.QueueUpdated &&
                 p.Payload is QueueEstimateDto q &&
                 q.JobId == booked.Id &&
                 p.Groups.Contains(RealtimeGroups.User(bookedCustomer)));
    }

    [Fact]
    public async Task Extend_delay_recalculates_dependent_job_eta()
    {
        await using var db = CreateDb();
        SeedBay(db);
        var firstCustomer = Guid.NewGuid();
        var secondCustomer = Guid.NewGuid();
        var first = SeedOpenJob(db, firstCustomer, queueOrder: 1, estimatedMinutes: 60, vehicleLabel: "First");
        var second = SeedOpenJob(db, secondCustomer, queueOrder: 2, estimatedMinutes: 60, vehicleLabel: "Second");
        var harness = CreateHarness(db);

        await harness.Queue.RecalculateAsync();
        var beforeSecond = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == second.Id);
        Assert.NotNull(beforeSecond.EtaAt);

        harness.Notifier.Publishes.Clear();

        var summary = await harness.Jobs.ExtendAsync(
            first.Id,
            new ExtendJobRequest(ExtraMinutes: 45, Reason: "Parts delayed"));

        Assert.Equal(105, summary.EstimatedMinutes);

        var afterFirst = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == first.Id);
        var afterSecond = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == second.Id);
        Assert.Equal(105, afterFirst.EstimatedMinutes);
        Assert.True(
            afterSecond.EtaAt > beforeSecond.EtaAt,
            "Extending the leading job must move the following job's indicative ETA later.");
        Assert.Equal(
            45,
            (afterSecond.EtaAt!.Value - beforeSecond.EtaAt!.Value).TotalMinutes,
            precision: 0);

        Assert.Contains(
            harness.Notifier.Publishes,
            p => p.EventName == RealtimeEvents.QueueUpdated);
    }

    [Fact]
    public async Task Large_eta_shift_notifies_customer_after_recalculation_persists()
    {
        await using var db = CreateDb();
        EnsureWorkshop(db, etaShiftNotifyMinutes: 10);
        SeedBay(db);
        var customerId = Guid.NewGuid();
        var leading = SeedOpenJob(db, Guid.NewGuid(), queueOrder: 1, estimatedMinutes: 60);
        var following = SeedOpenJob(
            db,
            customerId,
            queueOrder: 2,
            estimatedMinutes: 60,
            vehicleLabel: "Notify Me");
        var harness = CreateHarness(db);

        await harness.Queue.RecalculateAsync();
        var before = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == following.Id);
        Assert.NotNull(before.EtaAt);

        harness.Notifier.Notifications.Clear();
        harness.Notifier.Publishes.Clear();

        await harness.Jobs.ExtendAsync(
            leading.Id,
            new ExtendJobRequest(ExtraMinutes: 30, Reason: "Inspection overrun"));

        var after = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == following.Id);
        Assert.True(after.EtaAt > before.EtaAt);
        Assert.True(
            Math.Abs((after.EtaAt!.Value - before.EtaAt!.Value).TotalMinutes) >= 10);

        var shifted = Assert.Single(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.QueueEtaChanged &&
                 n.Message.JobId == following.Id);
        Assert.Equal("job", shifted.Message.EntityType);
        Assert.Equal(following.Id, shifted.Message.EntityId);
        Assert.Contains(shifted.Recipients, r => r.Role == Roles.Customer && r.UserId == customerId);
        Assert.True(shifted.Message.Data!.ContainsKey("etaAt"));
        Assert.Contains(
            shifted.Message.Title,
            new[]
            {
                "Your vehicle will take a little longer",
                "Good news: your vehicle may be ready sooner"
            });
    }

    [Fact]
    public async Task Small_eta_shift_below_threshold_does_not_notify_customer()
    {
        await using var db = CreateDb();
        EnsureWorkshop(db, etaShiftNotifyMinutes: 20);
        SeedBay(db);
        var customerId = Guid.NewGuid();
        var leading = SeedOpenJob(db, Guid.NewGuid(), queueOrder: 1, estimatedMinutes: 60);
        SeedOpenJob(db, customerId, queueOrder: 2, estimatedMinutes: 60, vehicleLabel: "Quiet");
        var harness = CreateHarness(db);

        await harness.Queue.RecalculateAsync();
        harness.Notifier.Notifications.Clear();

        await harness.Jobs.ExtendAsync(
            leading.Id,
            new ExtendJobRequest(ExtraMinutes: 5, Reason: "Minor pad"));

        Assert.DoesNotContain(
            harness.Notifier.Notifications,
            n => n.Message.Type == NotificationTypes.QueueEtaChanged);
    }
}
