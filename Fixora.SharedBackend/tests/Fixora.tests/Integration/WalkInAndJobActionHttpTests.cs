using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("walkin-job-action-http", DisableParallelization = true)]
public sealed class WalkInAndJobActionHttpCollection;

/// <summary>
/// Conflict-safe tests-only: manager walk-in job creation and mechanic job actions
/// on Open jobs. Does not change Confirm/CheckIn timing rules.
/// </summary>
[Collection("walkin-job-action-http")]
public sealed class WalkInAndJobActionHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Manager_walk_in_creates_active_job_for_assigned_mechanic()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

        var walkIn = await manager.PostAsJsonAsync(
            "/api/v1/manager/bookings/walk-in",
            new
            {
                customerId = (Guid?)null,
                customerName = "Walk-in NID",
                vehicleId = (Guid?)null,
                vehicleLabel = "Toyota Aqua (WALK-IN)",
                serviceId = DemoIds.ServiceOil,
                bayId = DemoIds.Bay2,
                mechanicId = DemoIds.MechanicKumar,
                priority = 0,
                complaint = "Oil change walk-in"
            });
        Assert.Equal(HttpStatusCode.OK, walkIn.StatusCode);
        var job = (await walkIn.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(DemoIds.MechanicKumar, job.MechanicId);
        Assert.Equal(DemoIds.Bay2, job.BayId);
        Assert.False(string.IsNullOrWhiteSpace(job.Number));
        Assert.Equal("Open", job.Status);

        var assigned = (await kumar.GetFromJsonAsync<List<JobSummaryDto>>("/api/v1/mechanic/jobs"))!;
        Assert.Contains(assigned, j => j.Id == job.Id);
    }

    [Fact]
    public async Task Mechanic_can_start_open_job_and_pause_requires_in_progress()
    {
        await using var factory = NewFactory();
        var kumar = await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });
        var jobId = DemoIds.JobArunToday;

        var start = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("start", null, null, null));
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        Assert.Equal("Inspecting", (await start.Content.ReadFromJsonAsync<JobSummaryDto>())!.Status);

        // Domain rule: pause is only allowed from InProgress (after approval release),
        // not from Inspecting — characterize HTTP Conflict here.
        var pause = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("pause", null, "Waiting for parts", null));
        Assert.Equal(HttpStatusCode.Conflict, pause.StatusCode);

        var again = await kumar.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/actions",
            new JobActionRequest("start", null, null, null));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Unassigned_mechanic_cannot_start_foreign_job()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobArunToday}/actions",
            new JobActionRequest("start", null, null, null));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_walk_in_or_run_mechanic_actions()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                "/api/v1/manager/bookings/walk-in",
                new
                {
                    customerName = "x",
                    vehicleLabel = "y",
                    serviceId = DemoIds.ServiceOil,
                    bayId = DemoIds.Bay1,
                    mechanicId = DemoIds.MechanicRavi,
                    priority = 0,
                    complaint = "no"
                })).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/actions",
                new JobActionRequest("progress", "Working", "update", 20))).StatusCode);
    }

    [Fact]
    public async Task Anonymous_walk_in_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/v1/manager/bookings/walk-in",
            new
            {
                customerName = "anon",
                vehicleLabel = "car",
                serviceId = DemoIds.ServiceOil,
                bayId = DemoIds.Bay1,
                mechanicId = DemoIds.MechanicRavi,
                priority = 0,
                complaint = "x"
            });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
