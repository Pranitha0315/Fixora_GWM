using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Contracts;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("drivesense-road-stress-http", DisableParallelization = true)]
public sealed class DriveSenseRoadStressHttpCollection;

/// <summary>
/// FX13-D08 / NAR heatmap: GET /api/v1/manager/drivesense/road-stress characterization.
/// Tests-only — does not change THA CustomerDirectory or Confirm/CheckIn timing.
/// </summary>
[Collection("drivesense-road-stress-http")]
public sealed class DriveSenseRoadStressHttpTests
{
    private const string RoadStressUrl = "/api/v1/manager/drivesense/road-stress";

    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Manager_can_list_road_stress_cells()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.GetAsync($"{RoadStressUrl}?days=30");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var cells = (await response.Content.ReadFromJsonAsync<List<RoadStressCellDto>>())!;
        Assert.NotNull(cells);
        foreach (var cell in cells)
        {
            Assert.False(string.IsNullOrWhiteSpace(cell.Geohash));
            Assert.InRange(cell.Lat, -90, 90);
            Assert.InRange(cell.Lng, -180, 180);
            Assert.True(cell.Vehicles >= 1);
            Assert.True(cell.Trips >= 1);
            Assert.Contains(cell.Level, new[] { "low", "medium", "high" });
        }
    }

    [Fact]
    public async Task Road_stress_json_uses_camelCase_contract_keys()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.GetAsync(RoadStressUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);

        if (doc.RootElement.GetArrayLength() == 0) return;

        var first = doc.RootElement[0];
        Assert.True(first.TryGetProperty("geohash", out _));
        Assert.True(first.TryGetProperty("lat", out _));
        Assert.True(first.TryGetProperty("lng", out _));
        Assert.True(first.TryGetProperty("vehicles", out _));
        Assert.True(first.TryGetProperty("trips", out _));
        Assert.True(first.TryGetProperty("roughRoadPct", out _));
        Assert.True(first.TryGetProperty("potholesPer100Km", out _));
        Assert.True(first.TryGetProperty("level", out _));
        Assert.False(first.TryGetProperty("vehicleId", out _));
        Assert.False(first.TryGetProperty("customerId", out _));
    }

    [Fact]
    public async Task Customer_and_mechanic_cannot_read_road_stress()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.Forbidden, (await kavitha.GetAsync(RoadStressUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ravi.GetAsync(RoadStressUrl)).StatusCode);
    }

    [Fact]
    public async Task Anonymous_road_stress_is_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(RoadStressUrl)).StatusCode);
    }
}
