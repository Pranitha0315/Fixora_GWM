using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Approvals;
using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Gateways;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Fixora.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Tests.Domain;

/// <summary>
/// FX13-D03-NID-2: manager job assignment events and customer service-history linkage.
/// </summary>
public sealed class ManagerJobAssignmentAndServiceHistoryTests
{
    private static readonly DateTime Now =
        new(2026, 11, 19, 12, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class CapturingNotifier : INotificationService
    {
        public List<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> Notifications { get; } = new();

        /// <summary>Runs while NotifyAsync is entered (after AssignAsync has saved).</summary>
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
    }

    /// <summary>Directory stub that can expose active, inactive, or unknown mechanics.</summary>
    private sealed class AssignableMechanicDirectory : IMechanicDirectory
    {
        private readonly HashSet<Guid> _active = new();
        private readonly HashSet<Guid> _inactive = new();

        public AssignableMechanicDirectory WithActive(params Guid[] ids)
        {
            foreach (var id in ids)
            {
                _active.Add(id);
            }

            return this;
        }

        public AssignableMechanicDirectory WithInactive(params Guid[] ids)
        {
            foreach (var id in ids)
            {
                _inactive.Add(id);
            }

            return this;
        }

        public Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default)
        {
            if (_active.Contains(mechanicId))
            {
                return Task.FromResult<MechanicSummary?>(
                    new MechanicSummary(mechanicId, "Active", "0770000001", "EMP-100", true, true));
            }

            if (_inactive.Contains(mechanicId))
            {
                return Task.FromResult<MechanicSummary?>(
                    new MechanicSummary(mechanicId, "Inactive", "0770000002", "EMP-101", false, false));
            }

            return Task.FromResult<MechanicSummary?>(null);
        }

        public Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MechanicSummary>>(Array.Empty<MechanicSummary>());
    }

    private sealed class Harness
    {
        public required ManagerDbContext Db { get; init; }
        public required JobService Jobs { get; init; }
        public required WorkshopGateway Workshop { get; init; }
        public required CapturingNotifier Notifier { get; init; }
        public required TestClock Clock { get; init; }
    }

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"mgr-assign-hist-{Guid.NewGuid():N}")
            .Options;
        return new ManagerDbContext(options);
    }

    private static Harness CreateHarness(ManagerDbContext db, params Guid[] mechanicIds)
        => CreateHarness(db, new AssignableMechanicDirectory().WithActive(mechanicIds));

    private static Harness CreateHarness(ManagerDbContext db, IMechanicDirectory mechanics)
    {
        var clock = new TestClock();
        var notifier = new CapturingNotifier();
        var customers = new StubCustomers();
        var media = new StubMedia();
        var read = new WorkshopReadModel(db, mechanics, media, clock);
        var queue = new QueueService(db, notifier, read, clock);
        var billing = new BillingService(db, customers, notifier, clock);
        var inventory = new InventoryService(db, notifier, clock);
        var jobs = new JobService(db, read, notifier, queue, billing, mechanics, clock);
        var bookings = new BookingService(db, read, notifier, queue, customers, clock);
        var approvals = new ApprovalWorkflowService(db, read, notifier, queue, inventory, clock);
        var changes = new ChangeRequestService(db, notifier, clock);
        var settings = new WorkshopSettingsService(db);
        var workshop = new WorkshopGateway(
            db, bookings, jobs, approvals, changes, billing, settings, read, clock);

        return new Harness
        {
            Db = db,
            Jobs = jobs,
            Workshop = workshop,
            Notifier = notifier,
            Clock = clock
        };
    }

    private static void EnsureWorkshop(ManagerDbContext db)
    {
        if (db.Workshops.Any())
        {
            return;
        }

        db.Workshops.Add(new Workshop
        {
            Name = "NID-2 Test Garage",
            LoyaltyEnabled = false,
            VatRate = 0m,
            EtaShiftNotifyMinutes = 20
        });
        db.SaveChanges();
    }

    private static Bay SeedBay(
        ManagerDbContext db,
        Guid? id = null,
        bool active = true,
        string name = "Bay 1")
    {
        EnsureWorkshop(db);

        var bay = new Bay
        {
            Id = id ?? Guid.NewGuid(),
            Name = name,
            Active = active,
            SortOrder = active ? 1 : 99
        };
        db.Bays.Add(bay);
        db.SaveChanges();
        return bay;
    }

    private static JobCard SeedOpenJob(
        ManagerDbContext db,
        Guid customerId,
        Guid? mechanicId = null,
        Guid? bayId = null)
    {
        EnsureWorkshop(db);

        var job = new JobCard
        {
            Number = $"JC-A-{Guid.NewGuid():N}"[..16],
            CustomerId = customerId,
            CustomerName = "Owner Customer",
            VehicleId = Guid.NewGuid(),
            VehicleLabel = "Toyota Aqua",
            MechanicId = mechanicId,
            BayId = bayId,
            Status = JobStatus.Open,
            Complaint = "Brake noise",
            EstimatedMinutes = 60,
            CreatedAt = Now
        };
        db.JobCards.Add(job);
        db.SaveChanges();
        return job;
    }

    private static JobCard SeedFinishedJob(
        ManagerDbContext db,
        Guid customerId,
        JobStatus status,
        string? releasedItemTitle = null,
        decimal? invoiceTotal = null)
    {
        if (status is not (JobStatus.Completed or JobStatus.Closed))
        {
            throw new ArgumentException("Finished seed requires Completed or Closed.", nameof(status));
        }

        EnsureWorkshop(db);

        var job = new JobCard
        {
            Number = $"JC-H-{Guid.NewGuid():N}"[..16],
            CustomerId = customerId,
            CustomerName = "Owner Customer",
            VehicleId = Guid.NewGuid(),
            VehicleLabel = "Honda Fit",
            MechanicId = Guid.NewGuid(),
            BayId = Guid.NewGuid(),
            Status = status,
            Complaint = "Service visit",
            EstimatedMinutes = 45,
            CreatedAt = Now.AddDays(-2),
            StartedAt = Now.AddDays(-2).AddHours(1),
            CompletedAt = Now.AddDays(-1)
        };
        db.JobCards.Add(job);
        db.SaveChanges();

        if (releasedItemTitle is not null)
        {
            db.RepairItems.Add(new RepairItem
            {
                ProposalId = Guid.NewGuid(),
                JobCardId = job.Id,
                Title = releasedItemTitle,
                Kind = RepairItemKind.Labour,
                Qty = 1,
                UnitPrice = 1500m,
                Status = RepairItemStatus.Released
            });
        }

        if (invoiceTotal is not null)
        {
            db.Invoices.Add(new Invoice
            {
                JobCardId = job.Id,
                CustomerId = customerId,
                Number = $"INV-{Guid.NewGuid():N}"[..12],
                Subtotal = invoiceTotal.Value,
                Total = invoiceTotal.Value,
                IssuedAt = Now.AddDays(-1)
            });
        }

        db.SaveChanges();
        return job;
    }

    private static IEnumerable<(NotificationMessage Message, IReadOnlyList<Recipient> Recipients)> JobAssignedNotifications(
        CapturingNotifier notifier)
        => notifier.Notifications.Where(n => n.Message.Type == NotificationTypes.JobAssigned);

    [Fact]
    public async Task Assign_sets_intended_mechanic_and_bay()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var bay = SeedBay(db);
        var job = SeedOpenJob(db, customerId);
        var harness = CreateHarness(db, mechanicId);

        var summary = await harness.Jobs.AssignAsync(
            Guid.NewGuid(),
            job.Id,
            new AssignJobRequest(mechanicId, bay.Id));

        Assert.Equal(mechanicId, summary.MechanicId);
        Assert.Equal(bay.Id, summary.BayId);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(mechanicId, reloaded.MechanicId);
        Assert.Equal(bay.Id, reloaded.BayId);
    }

    [Fact]
    public async Task Assignment_notification_is_emitted_after_successful_persistence()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var bay = SeedBay(db);
        var job = SeedOpenJob(db, customerId);
        var harness = CreateHarness(db, mechanicId);

        var persistedBeforeNotify = false;
        harness.Notifier.OnNotifyAsync = async () =>
        {
            var current = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
            persistedBeforeNotify =
                current.MechanicId == mechanicId &&
                current.BayId == bay.Id;
        };

        await harness.Jobs.AssignAsync(
            Guid.NewGuid(),
            job.Id,
            new AssignJobRequest(mechanicId, bay.Id));

        Assert.True(
            persistedBeforeNotify,
            "JobAssigned notification must run only after AssignAsync has saved mechanic and bay.");

        var assigned = Assert.Single(
            JobAssignedNotifications(harness.Notifier),
            n => n.Message.Title == "Job assigned to you");
        Assert.Equal(NotificationTypes.JobAssigned, assigned.Message.Type);
        Assert.Equal(job.Id, assigned.Message.JobId);
        Assert.Contains(
            assigned.Recipients,
            r => r.Role == Roles.Mechanic && r.UserId == mechanicId);
    }

    [Fact]
    public async Task Reassignment_revokes_previous_mechanic_visibility_and_actions()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var previous = Guid.NewGuid();
        var next = Guid.NewGuid();
        var bay = SeedBay(db);
        var job = SeedOpenJob(db, customerId, previous, SeedBay(db, name: "Prior Bay").Id);
        job.Status = JobStatus.InProgress;
        job.StartedAt = Now.AddMinutes(-20);
        job.RunningSince = Now.AddMinutes(-10);
        await db.SaveChangesAsync();

        var harness = CreateHarness(db, previous, next);

        await harness.Jobs.AssignAsync(
            Guid.NewGuid(),
            job.Id,
            new AssignJobRequest(next, bay.Id));

        var viewEx = await Assert.ThrowsAsync<NotFoundException>(
            () => harness.Jobs.GetAsync(
                job.Id,
                WorkshopReadModel.Viewer.Mechanic,
                previous,
                null));
        Assert.Equal("not_found", viewEx.Code);

        var actEx = await Assert.ThrowsAsync<NotFoundException>(
            () => harness.Jobs.ApplyMechanicActionAsync(
                previous,
                job.Id,
                new JobActionRequest("pause", null, null, null)));
        Assert.Equal("not_found", actEx.Code);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(next, reloaded.MechanicId);
        Assert.Equal(JobStatus.InProgress, reloaded.Status);

        var reassignNotice = Assert.Single(
            JobAssignedNotifications(harness.Notifier),
            n => n.Message.Title == "Job reassigned");
        Assert.Contains(
            reassignNotice.Recipients,
            r => r.Role == Roles.Mechanic && r.UserId == previous);
    }

    [Fact]
    public async Task Reassigning_same_mechanic_does_not_send_duplicate_job_assigned_notifications()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var firstBay = SeedBay(db, name: "Bay A");
        var secondBay = SeedBay(db, name: "Bay B");
        var job = SeedOpenJob(db, customerId, mechanicId, firstBay.Id);
        var harness = CreateHarness(db, mechanicId);

        await harness.Jobs.AssignAsync(
            Guid.NewGuid(),
            job.Id,
            new AssignJobRequest(mechanicId, secondBay.Id));

        Assert.Empty(JobAssignedNotifications(harness.Notifier));

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(mechanicId, reloaded.MechanicId);
        Assert.Equal(secondBay.Id, reloaded.BayId);
    }

    [Fact]
    public async Task Completed_job_appears_in_owning_customer_service_history()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var job = SeedFinishedJob(
            db,
            customerId,
            JobStatus.Completed,
            releasedItemTitle: "Brake labour",
            invoiceTotal: 1500m);
        var harness = CreateHarness(db);

        var history = await harness.Workshop.GetServiceHistoryAsync(customerId, null);

        var entry = Assert.Single(history);
        Assert.Equal(job.Id, entry.JobId);
        Assert.Equal(job.Number, entry.Number);
        Assert.Equal(job.VehicleId, entry.VehicleId);
        Assert.Equal(job.VehicleLabel, entry.VehicleLabel);
        Assert.Equal(job.CompletedAt, entry.Date);
        Assert.Equal(1500m, entry.Total);
        Assert.Contains("Service visit", entry.Work);
        Assert.Contains("Brake labour", entry.Work);
    }

    [Fact]
    public async Task Closed_job_appears_in_owning_customer_service_history()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var job = SeedFinishedJob(db, customerId, JobStatus.Closed);
        var harness = CreateHarness(db);

        var history = await harness.Workshop.GetServiceHistoryAsync(customerId, null);

        var entry = Assert.Single(history);
        Assert.Equal(job.Id, entry.JobId);
        Assert.Equal(0m, entry.Total);
        Assert.Contains("Service visit", entry.Work);
    }

    [Fact]
    public async Task Different_customer_cannot_view_job_in_their_service_history()
    {
        await using var db = CreateDb();
        var ownerId = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        var job = SeedFinishedJob(
            db,
            ownerId,
            JobStatus.Completed,
            releasedItemTitle: "Oil filter",
            invoiceTotal: 800m);
        var harness = CreateHarness(db);

        var otherHistory = await harness.Workshop.GetServiceHistoryAsync(otherId, null);

        Assert.DoesNotContain(otherHistory, h => h.JobId == job.Id);
        Assert.Empty(otherHistory);
    }

    // ---- Mechanic account validation on assign ----

    [Fact]
    public async Task Unknown_mechanic_is_rejected_without_mutating_job_or_notifying()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var existingMechanic = Guid.NewGuid();
        var existingBay = Guid.NewGuid();
        var unknownMechanic = Guid.NewGuid();
        var job = SeedOpenJob(db, customerId, existingMechanic, existingBay);
        var harness = CreateHarness(db, existingMechanic);

        var ex = await Assert.ThrowsAsync<NotFoundException>(
            () => harness.Jobs.AssignAsync(
                Guid.NewGuid(),
                job.Id,
                new AssignJobRequest(unknownMechanic, Guid.NewGuid())));

        Assert.Equal("not_found", ex.Code);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(existingMechanic, reloaded.MechanicId);
        Assert.Equal(existingBay, reloaded.BayId);
        Assert.Empty(JobAssignedNotifications(harness.Notifier));
    }

    [Fact]
    public async Task Inactive_mechanic_is_rejected_without_mutating_job_or_notifying()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var existingMechanic = Guid.NewGuid();
        var existingBay = Guid.NewGuid();
        var inactiveMechanic = Guid.NewGuid();
        var job = SeedOpenJob(db, customerId, existingMechanic, existingBay);
        var directory = new AssignableMechanicDirectory()
            .WithActive(existingMechanic)
            .WithInactive(inactiveMechanic);
        var harness = CreateHarness(db, directory);

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => harness.Jobs.AssignAsync(
                Guid.NewGuid(),
                job.Id,
                new AssignJobRequest(inactiveMechanic, Guid.NewGuid())));

        Assert.Equal("mechanic_inactive", ex.Code);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(existingMechanic, reloaded.MechanicId);
        Assert.Equal(existingBay, reloaded.BayId);
        Assert.Empty(JobAssignedNotifications(harness.Notifier));
    }

    [Fact]
    public async Task Active_mechanic_can_be_assigned()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var bay = SeedBay(db);
        var job = SeedOpenJob(db, customerId);
        var harness = CreateHarness(db, mechanicId);

        var summary = await harness.Jobs.AssignAsync(
            Guid.NewGuid(),
            job.Id,
            new AssignJobRequest(mechanicId, bay.Id));

        Assert.Equal(mechanicId, summary.MechanicId);
        Assert.Equal(bay.Id, summary.BayId);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(mechanicId, reloaded.MechanicId);
        Assert.Equal(bay.Id, reloaded.BayId);

        var assigned = Assert.Single(
            JobAssignedNotifications(harness.Notifier),
            n => n.Message.Title == "Job assigned to you");
        Assert.Contains(
            assigned.Recipients,
            r => r.Role == Roles.Mechanic && r.UserId == mechanicId);
    }

    // ---- Bay validation on assign ----

    [Fact]
    public async Task Unknown_bay_is_rejected_without_mutating_job_or_notifying()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var existingBay = SeedBay(db, name: "Existing Bay");
        var job = SeedOpenJob(db, customerId, mechanicId, existingBay.Id);
        var harness = CreateHarness(db, mechanicId);

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => harness.Jobs.AssignAsync(
                Guid.NewGuid(),
                job.Id,
                new AssignJobRequest(mechanicId, Guid.NewGuid())));

        Assert.Equal("validation_failed", ex.Code);
        Assert.Equal("Pick an active bay.", ex.Message);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(mechanicId, reloaded.MechanicId);
        Assert.Equal(existingBay.Id, reloaded.BayId);
        Assert.Empty(JobAssignedNotifications(harness.Notifier));
    }

    [Fact]
    public async Task Inactive_bay_is_rejected_without_mutating_job_or_notifying()
    {
        await using var db = CreateDb();
        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var existingBay = SeedBay(db, name: "Existing Bay");
        var inactiveBay = SeedBay(db, active: false, name: "Inactive Bay");
        var job = SeedOpenJob(db, customerId, mechanicId, existingBay.Id);
        var harness = CreateHarness(db, mechanicId);

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => harness.Jobs.AssignAsync(
                Guid.NewGuid(),
                job.Id,
                new AssignJobRequest(mechanicId, inactiveBay.Id)));

        Assert.Equal("validation_failed", ex.Code);
        Assert.Equal("Pick an active bay.", ex.Message);

        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(mechanicId, reloaded.MechanicId);
        Assert.Equal(existingBay.Id, reloaded.BayId);
        Assert.Empty(JobAssignedNotifications(harness.Notifier));
    }
}
