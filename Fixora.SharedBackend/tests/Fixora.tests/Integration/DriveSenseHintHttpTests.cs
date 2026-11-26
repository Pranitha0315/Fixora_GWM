using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Vehicles;
using Fixora.Customer.Contracts;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("drivesense-hint-http", DisableParallelization = true)]
public sealed class DriveSenseHintHttpCollection;

/// <summary>
/// FX13-D08-NID-2 Slice 1 (tests-only): characterize opted-in DriveSense hint wiring on
/// mechanic job detail and manager vehicle hint endpoints. Does not cover BR-FP-14
/// supporting-evidence linking or KAB/KOP UI.
/// </summary>
[Collection("drivesense-hint-http")]
public sealed class DriveSenseHintHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static string MechanicJobUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}";

    private static string ManagerHintUrl(Guid vehicleId)
        => $"/api/v1/manager/customers/vehicles/{vehicleId}/drivesense";

    private static string VehicleConsentUrl(Guid vehicleId)
        => $"/api/v1/customer/vehicles/{vehicleId}/drivesense";

    private static async Task<HttpClient> KumarAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

    /// <summary>
    /// CustomerSeeder writes four prior weeks; GetDriveSenseHintAsync uses newest WeekStart.
    /// For w=1: score 71, rough 62.2, potholes 30 → flags Rough roads + Pothole hits.
    /// </summary>
    private static DateOnly ExpectedNewestSeedWeekStart => DriveSenseService.WeekOf(DateTime.UtcNow).AddDays(-7);

    private static void AssertWagonRSeedHint(DriveSenseHintDto hint)
    {
        Assert.Equal(DemoIds.VehicleWagonR, hint.VehicleId);
        Assert.Equal(71, hint.DriveScore);
        Assert.Equal(62.2, hint.RoughRoadPct, precision: 3);
        Assert.Equal(30, hint.PotholeHits);
        Assert.Equal(ExpectedNewestSeedWeekStart, hint.WeekStart);
        Assert.Contains("Pothole hits", hint.TopFlags);
        Assert.Contains("Rough roads", hint.TopFlags);
        Assert.DoesNotContain("Harsh braking", hint.TopFlags);
        Assert.True(hint.TopFlags.Count <= 3);
    }

    [Fact]
    public async Task Opted_in_WagonR_job_returns_seeded_drivesense_hint()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.GetAsync(MechanicJobUrl(DemoIds.JobKavithaToday));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var detail = (await response.Content.ReadFromJsonAsync<MechanicJobDetailDto>())!;
        Assert.Equal(DemoIds.JobKavithaToday, detail.Detail.Job.Id);
        Assert.Equal(DemoIds.VehicleWagonR, detail.Detail.Job.VehicleId);
        Assert.NotNull(detail.DriveSense);
        AssertWagonRSeedHint(detail.DriveSense!);
    }

    [Fact]
    public async Task Opted_out_Axio_job_returns_null_drivesense_hint()
    {
        await using var factory = NewFactory();
        var kumar = await KumarAsync(factory);

        var response = await kumar.GetAsync(MechanicJobUrl(DemoIds.JobArunToday));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var detail = (await response.Content.ReadFromJsonAsync<MechanicJobDetailDto>())!;
        Assert.Equal(DemoIds.JobArunToday, detail.Detail.Job.Id);
        Assert.Equal(DemoIds.VehicleArunAxio, detail.Detail.Job.VehicleId);
        Assert.Null(detail.DriveSense);
    }

    [Fact]
    public async Task Opting_out_WagonR_clears_mechanic_job_drivesense_hint()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var kavitha = await factory.Customer();

        var before = (await (await ravi.GetAsync(MechanicJobUrl(DemoIds.JobKavithaToday)))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<MechanicJobDetailDto>())!;
        Assert.NotNull(before.DriveSense);

        var consent = await kavitha.PutAsJsonAsync(
            VehicleConsentUrl(DemoIds.VehicleWagonR),
            new DriveSenseConsent(OptIn: false));
        Assert.Equal(HttpStatusCode.OK, consent.StatusCode);
        var vehicle = (await consent.Content.ReadFromJsonAsync<VehicleDto>())!;
        Assert.False(vehicle.DriveSenseOptIn);

        var after = await ravi.GetAsync(MechanicJobUrl(DemoIds.JobKavithaToday));
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        var detail = (await after.Content.ReadFromJsonAsync<MechanicJobDetailDto>())!;
        Assert.Null(detail.DriveSense);
    }

    [Fact]
    public async Task Anonymous_mechanic_job_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync(MechanicJobUrl(DemoIds.JobKavithaToday));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Unassigned_mechanic_job_returns_not_found()
    {
        await using var factory = NewFactory();
        var kumar = await KumarAsync(factory);

        var response = await kumar.GetAsync(MechanicJobUrl(DemoIds.JobKavithaToday));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal(404, error.Status);
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Manager_drivesense_endpoint_respects_opt_in()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var optedIn = await manager.GetAsync(ManagerHintUrl(DemoIds.VehicleWagonR));
        Assert.Equal(HttpStatusCode.OK, optedIn.StatusCode);
        var hint = (await optedIn.Content.ReadFromJsonAsync<DriveSenseHintDto>())!;
        AssertWagonRSeedHint(hint);

        var optedOut = await manager.GetAsync(ManagerHintUrl(DemoIds.VehicleArunAxio));
        // ASP.NET returns 204 when the action result is null.
        Assert.Equal(HttpStatusCode.NoContent, optedOut.StatusCode);
        var body = await optedOut.Content.ReadAsStringAsync();
        Assert.True(string.IsNullOrWhiteSpace(body));
    }
}
