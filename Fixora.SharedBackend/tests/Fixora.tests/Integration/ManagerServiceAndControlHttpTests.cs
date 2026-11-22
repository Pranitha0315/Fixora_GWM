using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Control;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("manager-service-control-http", DisableParallelization = true)]
public sealed class ManagerServiceAndControlHttpCollection;

/// <summary>
/// Conflict-safe tests-only: manager service upsert + AutoPilot control settings.
/// Does not trigger Confirm/CheckIn job timing; only settings mutation + authz.
/// </summary>
[Collection("manager-service-control-http")]
public sealed class ManagerServiceAndControlHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Manager_can_create_and_update_service()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var create = await manager.PostAsJsonAsync(
            "/api/v1/manager/settings/services",
            new ServiceUpsert("NID Detail Wash", "Detailing", 45, 3500m, true));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = (await create.Content.ReadFromJsonAsync<ServiceDto>())!;
        Assert.Equal("NID Detail Wash", created.Name);
        Assert.Equal(45, created.StandardMinutes);
        Assert.Equal(3500m, created.BasePrice);

        var update = await manager.PutAsJsonAsync(
            $"/api/v1/manager/settings/services/{created.Id}",
            new ServiceUpsert("NID Detail Wash Plus", "Detailing", 60, 4200m, true));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = (await update.Content.ReadFromJsonAsync<ServiceDto>())!;
        Assert.Equal("NID Detail Wash Plus", updated.Name);
        Assert.Equal(60, updated.StandardMinutes);
        Assert.Equal(4200m, updated.BasePrice);

        var list = (await manager.GetFromJsonAsync<List<ServiceDto>>(
            "/api/v1/manager/settings/services"))!;
        Assert.Contains(list, s => s.Id == created.Id && s.Name == "NID Detail Wash Plus");
    }

    [Fact]
    public async Task Service_create_rejects_empty_name_or_non_positive_duration()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await manager.PostAsJsonAsync(
                "/api/v1/manager/settings/services",
                new ServiceUpsert("", "x", 30, 100m, true))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await manager.PostAsJsonAsync(
                "/api/v1/manager/settings/services",
                new ServiceUpsert("Bad", "x", 0, 100m, true))).StatusCode);
    }

    [Fact]
    public async Task Manager_can_update_control_settings()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var before = (await manager.GetFromJsonAsync<ControlStatusDto>(
            "/api/v1/manager/control"))!;
        Assert.False(string.IsNullOrWhiteSpace(before.Mode));

        var update = await manager.PutAsJsonAsync(
            "/api/v1/manager/control",
            new ControlUpdateRequest(
                Mode: "Auto",
                AutoWhenAway: true,
                AwayMinutes: 15,
                HoldAboveRupees: 25000m,
                AutoBookings: false,
                AutoSos: false));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var after = (await update.Content.ReadFromJsonAsync<ControlStatusDto>())!;
        Assert.Equal("Auto", after.Mode);
        Assert.Equal(15, after.AwayMinutes);
        Assert.Equal(25000m, after.HoldAboveRupees);
        Assert.False(after.AutoBookings);
        Assert.False(after.AutoSos);

        var seen = await manager.PostAsync("/api/v1/manager/control/seen", null);
        Assert.Equal(HttpStatusCode.NoContent, seen.StatusCode);
    }

    [Fact]
    public async Task Control_update_rejects_invalid_mode_or_away_minutes()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await manager.PutAsJsonAsync(
                "/api/v1/manager/control",
                new ControlUpdateRequest("Nope", true, 10, 0, false, false))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await manager.PutAsJsonAsync(
                "/api/v1/manager/control",
                new ControlUpdateRequest("Manager", true, 0, 0, false, false))).StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_mutate_services_or_control()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                "/api/v1/manager/settings/services",
                new ServiceUpsert("x", "y", 30, 1m, true))).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PutAsJsonAsync(
                "/api/v1/manager/control",
                new ControlUpdateRequest("Auto", true, 10, 0, false, false))).StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_read_or_update_control()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/control")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PutAsJsonAsync(
                "/api/v1/manager/control",
                new ControlUpdateRequest("Manager", true, 10, 0, false, false))).StatusCode);
    }
}
