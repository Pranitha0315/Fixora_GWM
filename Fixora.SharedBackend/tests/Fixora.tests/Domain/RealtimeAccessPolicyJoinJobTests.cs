using Fixora.Manager.Application.Gateways;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Tests.Domain;

/// <summary>
/// FX13-D05-NID-2: RealtimeAccessPolicy.CanJoinJobAsync gate used by FixoraHub.JoinJob.
/// Characterizes allow/deny for customer, mechanic and staff — not live SignalR delivery.
/// </summary>
public sealed class RealtimeAccessPolicyJoinJobTests
{
    private static readonly DateTime Now =
        new(2026, 11, 20, 10, 0, 0, DateTimeKind.Utc);

    private sealed class Harness : IAsyncDisposable
    {
        public required ManagerDbContext Db { get; init; }
        public required JobCard Job { get; init; }
        public required Guid OwnerCustomerId { get; init; }
        public required Guid AssignedMechanicId { get; init; }

        public RealtimeAccessPolicy Policy => new(Db);

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private static async Task<Harness> SeedAssignedJobAsync()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"realtime-join-job-{Guid.NewGuid():N}")
            .Options;
        var db = new ManagerDbContext(options);

        var ownerCustomerId = Guid.NewGuid();
        var assignedMechanicId = Guid.NewGuid();
        var job = new JobCard
        {
            Number = $"JC-RJ-{Guid.NewGuid():N}"[..16],
            CustomerId = ownerCustomerId,
            CustomerName = "Owner Customer",
            VehicleId = Guid.NewGuid(),
            VehicleLabel = "Test Vehicle",
            MechanicId = assignedMechanicId,
            BayId = Guid.NewGuid(),
            Status = JobStatus.Inspecting,
            Complaint = "Brake noise",
            EstimatedMinutes = 90,
            CreatedAt = Now,
            StartedAt = Now.AddMinutes(-20),
            RunningSince = Now.AddMinutes(-15)
        };
        db.JobCards.Add(job);
        await db.SaveChangesAsync();

        return new Harness
        {
            Db = db,
            Job = job,
            OwnerCustomerId = ownerCustomerId,
            AssignedMechanicId = assignedMechanicId
        };
    }

    [Fact]
    public async Task Owning_customer_can_join_own_job()
    {
        await using var harness = await SeedAssignedJobAsync();

        var allowed = await harness.Policy.CanJoinJobAsync(
            harness.OwnerCustomerId,
            Roles.Customer,
            harness.Job.Id);

        Assert.True(allowed);
    }

    [Fact]
    public async Task Different_customer_cannot_join_job()
    {
        await using var harness = await SeedAssignedJobAsync();

        var allowed = await harness.Policy.CanJoinJobAsync(
            Guid.NewGuid(),
            Roles.Customer,
            harness.Job.Id);

        Assert.False(allowed);
    }

    [Fact]
    public async Task Assigned_mechanic_can_join_assigned_job()
    {
        await using var harness = await SeedAssignedJobAsync();

        var allowed = await harness.Policy.CanJoinJobAsync(
            harness.AssignedMechanicId,
            Roles.Mechanic,
            harness.Job.Id);

        Assert.True(allowed);
    }

    [Fact]
    public async Task Unassigned_mechanic_cannot_join_job()
    {
        await using var harness = await SeedAssignedJobAsync();

        var allowed = await harness.Policy.CanJoinJobAsync(
            Guid.NewGuid(),
            Roles.Mechanic,
            harness.Job.Id);

        Assert.False(allowed);
    }

    [Fact]
    public async Task Manager_staff_can_join_job()
    {
        await using var harness = await SeedAssignedJobAsync();

        var allowed = await harness.Policy.CanJoinJobAsync(
            Guid.NewGuid(),
            Roles.Manager,
            harness.Job.Id);

        Assert.True(allowed);
    }

    [Fact]
    public async Task Unknown_job_is_denied_for_customer_and_mechanic()
    {
        await using var harness = await SeedAssignedJobAsync();
        var missingJobId = Guid.NewGuid();

        Assert.False(await harness.Policy.CanJoinJobAsync(
            harness.OwnerCustomerId,
            Roles.Customer,
            missingJobId));
        Assert.False(await harness.Policy.CanJoinJobAsync(
            harness.AssignedMechanicId,
            Roles.Mechanic,
            missingJobId));
    }
}
