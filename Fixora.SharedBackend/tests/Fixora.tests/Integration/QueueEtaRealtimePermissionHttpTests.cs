using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("queue-eta-permission-http", DisableParallelization = true)]
public sealed class QueueEtaRealtimePermissionHttpCollection;

/// <summary>
/// FX13-D05-NID-2 HTTP: customer ETA ownership and mechanic job-access permissions.
/// Characterizes JWT-backed API routes only — does not assert SignalR delivery.
/// Isolated <see cref="FixoraFactory"/> so seed reads stay independent of the shared api fixture.
/// </summary>
[Collection("queue-eta-permission-http")]
public sealed class QueueEtaRealtimePermissionHttpTests : IAsyncLifetime
{
    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static async Task<ApiErrorResponse> ReadErrorAsync(HttpResponseMessage response)
    {
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>();
        Assert.NotNull(error);
        return error!;
    }

    private async Task<HttpClient> KavithaAsync() => await _factory.Customer();

    private async Task<HttpClient> ArunAsync()
        => await _factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private async Task<HttpClient> RaviAsync() => await _factory.Mechanic();

    private async Task<HttpClient> KumarAsync()
        => await _factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

    [Fact]
    public async Task Owner_customer_can_get_own_job_eta()
    {
        var kavitha = await KavithaAsync();

        var response = await kavitha.GetAsync($"/api/v1/customer/queue/{DemoIds.JobKavithaToday}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var eta = (await response.Content.ReadFromJsonAsync<QueueEstimateDto>())!;
        Assert.Equal(DemoIds.JobKavithaToday, eta.JobId);
        Assert.Equal(JobStatus.Inspecting.ToString(), eta.Status);
        Assert.True(eta.Indicative);
        Assert.True(eta.Position >= 0);
    }

    [Fact]
    public async Task Other_customer_cannot_get_foreign_job_eta()
    {
        var arun = await ArunAsync();

        var response = await arun.GetAsync($"/api/v1/customer/queue/{DemoIds.JobKavithaToday}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await ReadErrorAsync(response);
        Assert.Equal(404, error.Status);
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Assigned_mechanic_can_get_assigned_job()
    {
        var ravi = await RaviAsync();

        var response = await ravi.GetAsync($"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<MechanicJobDetailDto>())!;
        Assert.Equal(DemoIds.JobKavithaToday, detail.Detail.Job.Id);
        Assert.Equal(DemoIds.CustomerKavitha, detail.Detail.Job.CustomerId);
        Assert.Equal(DemoIds.MechanicRavi, detail.Detail.Job.MechanicId);
        Assert.Equal(DemoIds.JobKavithaToday, detail.Detail.Queue.JobId);
        Assert.True(detail.Detail.Queue.Indicative);
    }

    [Fact]
    public async Task Unassigned_mechanic_cannot_get_foreign_job()
    {
        var kumar = await KumarAsync();

        var response = await kumar.GetAsync($"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = await ReadErrorAsync(response);
        Assert.Equal(404, error.Status);
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Owner_customer_eta_payload_is_scoped_to_requested_job_only()
    {
        var kavitha = await KavithaAsync();

        var response = await kavitha.GetAsync($"/api/v1/customer/queue/{DemoIds.JobKavithaToday}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var eta = (await response.Content.ReadFromJsonAsync<QueueEstimateDto>())!;

        // QueueEstimateDto is a single-job projection (JobId/Position/EtaAt/Status/Indicative).
        // Assert no cross-job identity and that the foreign seeded job is not returned.
        Assert.Equal(DemoIds.JobKavithaToday, eta.JobId);
        Assert.NotEqual(DemoIds.JobArunToday, eta.JobId);
        Assert.True(eta.Indicative);
        Assert.False(string.IsNullOrWhiteSpace(eta.Status));
    }
}
