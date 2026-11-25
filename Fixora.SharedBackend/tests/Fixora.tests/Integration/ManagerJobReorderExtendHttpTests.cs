using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("manager-job-reorder-extend-http", DisableParallelization = true)]
public sealed class ManagerJobReorderExtendHttpCollection;

/// <summary>
/// Conflict-safe tests-only: manager job reorder/extend HTTP (queue ETA triggers).
/// Does not change Confirm/CheckIn timing or THA production files.
/// </summary>
[Collection("manager-job-reorder-extend-http")]
public sealed class ManagerJobReorderExtendHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Manager_extend_updates_estimated_minutes_on_open_job()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var jobId = DemoIds.JobArunToday;

        var before = (await manager.GetFromJsonAsync<JobDetailDto>(
            $"/api/v1/manager/jobs/{jobId}"))!.Job;
        Assert.Equal(90, before.EstimatedMinutes);

        var response = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{jobId}/extend",
            new ExtendJobRequest(30, "Parts delayed"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var after = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(jobId, after.Id);
        Assert.Equal(120, after.EstimatedMinutes);
        Assert.NotNull(after.EtaAt);
    }

    [Fact]
    public async Task Manager_reorder_updates_priority_on_open_job()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var jobId = DemoIds.JobArunToday;

        var response = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{jobId}/reorder",
            new ReorderJobRequest(Priority: 2, QueueOrder: 1));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var after = (await response.Content.ReadFromJsonAsync<JobSummaryDto>())!;
        Assert.Equal(jobId, after.Id);
        Assert.Equal(2, after.Priority);
        Assert.True(after.QueuePosition >= 0);
    }

    [Fact]
    public async Task Extend_rejects_extra_minutes_outside_allowed_range()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var tooHigh = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/extend",
            new ExtendJobRequest(500, "too much"));
        Assert.Equal(HttpStatusCode.BadRequest, tooHigh.StatusCode);

        var tooLow = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobArunToday}/extend",
            new ExtendJobRequest(-200, "too little"));
        Assert.Equal(HttpStatusCode.BadRequest, tooLow.StatusCode);
    }

    [Fact]
    public async Task Customer_and_mechanic_cannot_reorder_or_extend()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var ravi = await factory.Mechanic();
        var jobId = DemoIds.JobArunToday;

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/extend",
                new ExtendJobRequest(15, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/reorder",
                new ReorderJobRequest(1, 1))).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/extend",
                new ExtendJobRequest(15, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/reorder",
                new ReorderJobRequest(1, 1))).StatusCode);
    }

    [Fact]
    public async Task Anonymous_reorder_and_extend_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var jobId = DemoIds.JobArunToday;

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/extend",
                new ExtendJobRequest(15, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                $"/api/v1/manager/jobs/{jobId}/reorder",
                new ReorderJobRequest(1, 1))).StatusCode);
    }
}
