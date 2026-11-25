using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
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
/// FX13-D03-NID-1: mechanic visibility for assigned jobs and JobCard / action transitions.
/// </summary>
public sealed class JobCardMechanicVisibilityAndTransitionTests
{
    private static readonly DateTime Now =
        new(2026, 11, 19, 10, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class StubNotifier : INotificationService
    {
        public Task NotifyAsync(
            NotificationMessage message,
            IEnumerable<Recipient> recipients,
            CancellationToken ct = default)
            => Task.CompletedTask;

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
            decimal loyaltyPercent,
            decimal loyaltyCapRupees,
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

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"job-card-mech-{Guid.NewGuid():N}")
            .Options;
        return new ManagerDbContext(options);
    }

    private static JobService CreateJobService(ManagerDbContext db, IClock clock)
    {
        var mechanics = new TestMechanicDirectory();
        var read = new WorkshopReadModel(db, mechanics, new StubMedia(), clock);
        var notifier = new StubNotifier();
        var queue = new QueueService(db, notifier, read, clock);
        var billing = new BillingService(db, new StubCustomers(), notifier, clock);
        // Shared JobService ctor: (db, read, notifier, queue, billing, clock) — no IMechanicDirectory.
        return new JobService(db, read, notifier, queue, billing, clock);
    }

    private static JobCard SeedAssignedJob(
        ManagerDbContext db,
        Guid assigneeId,
        JobStatus status = JobStatus.Open)
    {
        db.Workshops.Add(new Workshop
        {
            Name = "Test Garage",
            LoyaltyEnabled = false,
            VatRate = 0m
        });

        var job = new JobCard
        {
            Number = $"JC-TEST-{Guid.NewGuid():N}"[..16],
            CustomerId = Guid.NewGuid(),
            CustomerName = "Test Customer",
            VehicleId = Guid.NewGuid(),
            VehicleLabel = "Test Vehicle",
            MechanicId = assigneeId,
            BayId = Guid.NewGuid(),
            Status = status,
            Complaint = "Noise",
            EstimatedMinutes = 60,
            CreatedAt = Now,
            StartedAt = status == JobStatus.Open ? null : Now.AddMinutes(-30),
            RunningSince = status is JobStatus.Inspecting or JobStatus.InProgress
                ? Now.AddMinutes(-10)
                : null
        };
        db.JobCards.Add(job);
        db.SaveChanges();
        return job;
    }

    // ---- Domain transitions ----

    [Fact]
    public void Pause_rejects_when_job_is_not_in_progress()
    {
        var job = new JobCard { Status = JobStatus.Open };
        var ex = Assert.Throws<ConflictException>(() => job.Pause(Now));
        Assert.Equal("job_not_running", ex.Code);
        Assert.Equal(JobStatus.Open, job.Status);
    }

    [Fact]
    public void Resume_rejects_when_job_is_not_paused()
    {
        var job = new JobCard { Status = JobStatus.InProgress };
        var ex = Assert.Throws<ConflictException>(() => job.Resume(Now));
        Assert.Equal("job_not_paused", ex.Code);
        Assert.Equal(JobStatus.InProgress, job.Status);
    }

    [Fact]
    public void Complete_rejects_when_job_is_still_open()
    {
        var job = new JobCard { Status = JobStatus.Open };
        var ex = Assert.Throws<ConflictException>(() => job.Complete(Now));
        Assert.Equal("job_cannot_complete", ex.Code);
        Assert.Equal(JobStatus.Open, job.Status);
    }

    [Fact]
    public void Valid_start_pause_resume_complete_preserves_worked_minutes()
    {
        var job = new JobCard { Status = JobStatus.Open };
        var t0 = Now;
        var t1 = Now.AddMinutes(20);
        var t2 = Now.AddMinutes(35);
        var t3 = Now.AddMinutes(50);

        job.Start(t0);
        Assert.Equal(JobStatus.Inspecting, job.Status);

        // Approved repair phase (manager release path).
        job.BeginApprovedWork(t0);
        Assert.Equal(JobStatus.InProgress, job.Status);

        job.Pause(t1);
        Assert.Equal(JobStatus.Paused, job.Status);
        Assert.Equal(20, job.WorkedMinutes, 3);
        Assert.Null(job.RunningSince);

        job.Resume(t2);
        Assert.Equal(JobStatus.InProgress, job.Status);
        Assert.Equal(t2, job.RunningSince);
        Assert.Equal(20, job.WorkedMinutes, 3);

        job.Complete(t3);
        Assert.Equal(JobStatus.Completed, job.Status);
        Assert.Equal(35, job.WorkedMinutes, 3);
        Assert.Equal(t3, job.CompletedAt);
    }

    // ---- Service visibility / actions ----

    [Fact]
    public async Task Other_mechanic_cannot_view_assigned_job()
    {
        await using var db = CreateDb();
        var assignee = Guid.NewGuid();
        var other = Guid.NewGuid();
        var job = SeedAssignedJob(db, assignee, JobStatus.Inspecting);
        var service = CreateJobService(db, new TestClock());

        var ex = await Assert.ThrowsAsync<NotFoundException>(
            () => service.GetAsync(
                job.Id,
                WorkshopReadModel.Viewer.Mechanic,
                other,
                null));

        Assert.Equal("not_found", ex.Code);
    }

    [Fact]
    public async Task Other_mechanic_cannot_act_on_assigned_job()
    {
        await using var db = CreateDb();
        var assignee = Guid.NewGuid();
        var other = Guid.NewGuid();
        var job = SeedAssignedJob(db, assignee, JobStatus.InProgress);
        var service = CreateJobService(db, new TestClock());

        var ex = await Assert.ThrowsAsync<NotFoundException>(
            () => service.ApplyMechanicActionAsync(
                other,
                job.Id,
                new JobActionRequest("pause", null, null, null)));

        Assert.Equal("not_found", ex.Code);
        var reloaded = await db.JobCards.AsNoTracking().SingleAsync(j => j.Id == job.Id);
        Assert.Equal(JobStatus.InProgress, reloaded.Status);
    }

    [Fact]
    public async Task Assignee_pause_and_resume_use_Shared_LastPercent_constants()
    {
        // Shared JobService.LastPercent: Paused → 50, otherwise → 60 (ignores prior ProgressUpdate %).
        await using var db = CreateDb();
        var assignee = Guid.NewGuid();
        var job = SeedAssignedJob(db, assignee, JobStatus.InProgress);
        db.ProgressUpdates.Add(new ProgressUpdate
        {
            JobCardId = job.Id,
            Stage = "Repair",
            Message = "Pads removed",
            Percent = 42,
            ActorRole = Roles.Mechanic,
            ActorId = assignee,
            At = Now.AddMinutes(-5)
        });
        await db.SaveChangesAsync();

        var clock = new TestClock();
        var service = CreateJobService(db, clock);

        var paused = await service.ApplyMechanicActionAsync(
            assignee,
            job.Id,
            new JobActionRequest("pause", null, "Waiting parts", null));
        Assert.Equal("Paused", paused.Status);

        var pauseUpdate = await db.ProgressUpdates
            .AsNoTracking()
            .Where(p => p.JobCardId == job.Id && p.Stage == "Paused")
            .OrderByDescending(p => p.At)
            .FirstAsync();
        Assert.Equal(50, pauseUpdate.Percent);

        clock.UtcNow = Now.AddMinutes(10);
        var resumed = await service.ApplyMechanicActionAsync(
            assignee,
            job.Id,
            new JobActionRequest("resume", null, null, null));
        Assert.Equal("InProgress", resumed.Status);

        var resumeUpdate = await db.ProgressUpdates
            .AsNoTracking()
            .Where(p => p.JobCardId == job.Id && p.Stage == "Repair")
            .OrderByDescending(p => p.At)
            .FirstAsync();
        Assert.Equal(60, resumeUpdate.Percent);
        Assert.Equal("Work resumed.", resumeUpdate.Message);
    }
}
