using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Vehicles;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("customer-vehicle-crud-http", DisableParallelization = true)]
public sealed class CustomerVehicleCrudHttpCollection;

/// <summary>
/// Conflict-safe tests-only: customer vehicle add/update/remove + ownership 404.
/// DriveSense consent covered elsewhere; no Confirm/CheckIn timing changes.
/// </summary>
[Collection("customer-vehicle-crud-http")]
public sealed class CustomerVehicleCrudHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static VehicleUpsert NewVehicle(string reg) => new(
        reg, "Toyota", "Vitz", 2018, "Car", 45000, "Silver", "Petrol");

    [Fact]
    public async Task Customer_can_add_update_and_remove_vehicle()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var reg = $"NP NID-{Guid.NewGuid().ToString("N")[..6]}".ToUpperInvariant();

        var add = await kavitha.PostAsJsonAsync(
            "/api/v1/customer/vehicles",
            NewVehicle(reg));
        Assert.Equal(HttpStatusCode.OK, add.StatusCode);
        var created = (await add.Content.ReadFromJsonAsync<VehicleDto>())!;
        Assert.Equal(reg, created.RegistrationNo);
        Assert.Equal("Toyota", created.Make);
        Assert.False(created.DriveSenseOptIn);

        var list = (await kavitha.GetFromJsonAsync<List<VehicleDto>>("/api/v1/customer/vehicles"))!;
        Assert.Contains(list, v => v.Id == created.Id);

        var update = await kavitha.PutAsJsonAsync(
            $"/api/v1/customer/vehicles/{created.Id}",
            new VehicleUpsert(reg, "Toyota", "Vitz", 2019, "Car", 52000, "Blue", "Petrol"));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = (await update.Content.ReadFromJsonAsync<VehicleDto>())!;
        Assert.Equal(2019, updated.Year);
        Assert.Equal(52000, updated.MileageKm);
        Assert.Equal("Blue", updated.Color);

        var remove = await kavitha.DeleteAsync($"/api/v1/customer/vehicles/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, remove.StatusCode);

        var after = (await kavitha.GetFromJsonAsync<List<VehicleDto>>("/api/v1/customer/vehicles"))!;
        Assert.DoesNotContain(after, v => v.Id == created.Id);
    }

    [Fact]
    public async Task Duplicate_registration_for_same_customer_is_conflict()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var reg = $"NP DUP-{Guid.NewGuid().ToString("N")[..6]}".ToUpperInvariant();

        Assert.Equal(HttpStatusCode.OK,
            (await kavitha.PostAsJsonAsync("/api/v1/customer/vehicles", NewVehicle(reg))).StatusCode);

        var again = await kavitha.PostAsJsonAsync("/api/v1/customer/vehicles", NewVehicle(reg));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Invalid_year_or_missing_fields_are_bad_request()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await kavitha.PostAsJsonAsync(
                "/api/v1/customer/vehicles",
                new VehicleUpsert("NP BAD-1", "Toyota", "Vitz", 1950, "Car", 1, null, null))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await kavitha.PostAsJsonAsync(
                "/api/v1/customer/vehicles",
                new VehicleUpsert("", "Toyota", "Vitz", 2018, "Car", 1, null, null))).StatusCode);
    }

    [Fact]
    public async Task Other_customers_vehicle_is_not_found()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var arun = await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

        Assert.Equal(HttpStatusCode.NotFound,
            (await kavitha.PutAsJsonAsync(
                $"/api/v1/customer/vehicles/{DemoIds.VehicleArunAxio}",
                NewVehicle("NP HACK-1"))).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound,
            (await kavitha.DeleteAsync(
                $"/api/v1/customer/vehicles/{DemoIds.VehicleArunAxio}")).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await arun.GetAsync("/api/v1/customer/vehicles")).StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_list_or_add_vehicles()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/customer/vehicles")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                "/api/v1/customer/vehicles",
                NewVehicle("NP ANON-1"))).StatusCode);
    }
}
