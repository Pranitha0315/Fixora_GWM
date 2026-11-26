using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Vehicles;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("drivesense-trips-privacy-http", DisableParallelization = true)]
public sealed class DriveSenseTripsPrivacyHttpCollection;

/// <summary>
/// Conflict-safe tests-only: DriveSense trip upload/summary/trips + PDPA delete-all.
/// Does not edit THA weekly workers or Shared_Backend production.
/// </summary>
[Collection("drivesense-trips-privacy-http")]
public sealed class DriveSenseTripsPrivacyHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Upload_trip_then_summary_and_trips_reflect_it()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var vehicleId = DemoIds.VehicleWagonR;

        var upload = await kavitha.PostAsJsonAsync(
            "/api/v1/customer/drivesense/trips",
            new[]
            {
                new TripSummaryUpload(
                    vehicleId,
                    DateTime.UtcNow.AddHours(-2),
                    12.5,
                    4.0,
                    6,
                    2,
                    1,
                    1,
                    0.9,
                    new[] { "tc3n0" })
            });
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var trips = (await upload.Content.ReadFromJsonAsync<List<TripDto>>())!;
        Assert.Single(trips);
        Assert.Equal(vehicleId, trips[0].VehicleId);
        Assert.True(trips[0].DistanceKm >= 12);

        var summary = await kavitha.GetFromJsonAsync<DriveSenseSummaryDto>(
            $"/api/v1/customer/drivesense/vehicles/{vehicleId}");
        Assert.NotNull(summary);
        Assert.True(summary!.OptedIn);
        Assert.NotEmpty(summary.History);

        var listed = (await kavitha.GetFromJsonAsync<List<TripDto>>(
            $"/api/v1/customer/drivesense/vehicles/{vehicleId}/trips"))!;
        Assert.Contains(listed, t => t.Id == trips[0].Id);
    }

    [Fact]
    public async Task Upload_on_opted_out_vehicle_fails_and_foreign_summary_is_not_found()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var arun = await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

        var bad = await kavitha.PostAsJsonAsync(
            "/api/v1/customer/drivesense/trips",
            new[]
            {
                new TripSummaryUpload(
                    DemoIds.VehicleThreeWheeler,
                    DateTime.UtcNow.AddHours(-1),
                    5,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0.8,
                    null)
            });
        Assert.Equal(HttpStatusCode.Forbidden, bad.StatusCode);
        var error = (await bad.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("drivesense_off", error.Code);

        var foreign = await arun.GetAsync(
            $"/api/v1/customer/drivesense/vehicles/{DemoIds.VehicleWagonR}");
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task Delete_all_drive_data_removes_open_suggestions_and_can_opt_out()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var before = (await kavitha.GetFromJsonAsync<List<SuggestionDto>>(
            "/api/v1/customer/suggestions"))!;
        Assert.Contains(before, s => s.Status == "Open");

        var delete = await kavitha.DeleteAsync("/api/v1/customer/drivesense/data");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
        using var doc = JsonDocument.Parse(await delete.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("deleted").GetInt32() >= 1);

        var after = (await kavitha.GetFromJsonAsync<List<SuggestionDto>>(
            "/api/v1/customer/suggestions"))!;
        Assert.DoesNotContain(after, s => s.Status == "Open");

        var vehicles = (await kavitha.GetFromJsonAsync<List<VehicleDto>>(
            "/api/v1/customer/vehicles"))!;
        Assert.Contains(vehicles, v => v.Id == DemoIds.VehicleWagonR && !v.DriveSenseOptIn);
    }

    [Fact]
    public async Task Anonymous_trip_upload_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/v1/customer/drivesense/trips",
            new[]
            {
                new TripSummaryUpload(DemoIds.VehicleWagonR, DateTime.UtcNow, 1, 0, 0, 0, 0, 0, 1, null)
            });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
