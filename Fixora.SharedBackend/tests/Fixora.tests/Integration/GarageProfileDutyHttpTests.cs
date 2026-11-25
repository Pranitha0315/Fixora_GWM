using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Auth;
using Fixora.Customer.Contracts;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Auth;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("garage-profile-duty-http", DisableParallelization = true)]
public sealed class GarageProfileDutyHttpCollection;

/// <summary>
/// Conflict-safe tests-only: customer garage/profile/service-history and mechanic
/// profile/duty. No Confirm/CheckIn timing, no THA production edits.
/// </summary>
[Collection("garage-profile-duty-http")]
public sealed class GarageProfileDutyHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Customer_garage_exposes_emergency_phone_and_seeded_services()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var garage = await kavitha.GetFromJsonAsync<GarageDto>("/api/v1/customer/garage");
        Assert.NotNull(garage);
        Assert.False(string.IsNullOrWhiteSpace(garage!.Name));
        Assert.False(string.IsNullOrWhiteSpace(garage.EmergencyPhone));
        Assert.True(garage.LoyaltyEnabled);

        var services = (await kavitha.GetFromJsonAsync<List<ServiceDto>>("/api/v1/customer/garage/services"))!;
        Assert.Contains(services, s => s.Id == DemoIds.ServiceBrake && s.Name.Contains("Brake", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(services, s => s.Id == DemoIds.ServiceSuspension);
    }

    [Fact]
    public async Task Customer_profile_get_and_update_round_trips()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var before = await kavitha.GetFromJsonAsync<ProfileDto>("/api/v1/customer/profile");
        Assert.NotNull(before);
        Assert.Equal("Kavitha", before!.Name);
        Assert.Equal("kavitha@fixora.lk", before.Email);

        var nextLang = before.PreferredLanguage == "ta" ? "en" : "ta";
        var update = await kavitha.PutAsJsonAsync(
            "/api/v1/customer/profile",
            new UpdateProfileRequest(before.Name, before.Phone, nextLang));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var after = (await update.Content.ReadFromJsonAsync<ProfileDto>())!;
        Assert.Equal(nextLang, after.PreferredLanguage);

        var reload = await kavitha.GetFromJsonAsync<ProfileDto>("/api/v1/customer/profile");
        Assert.Equal(nextLang, reload!.PreferredLanguage);
    }

    [Fact]
    public async Task Service_history_and_manager_customers_are_role_scoped()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();

        var historyResponse = await kavitha.GetAsync("/api/v1/customer/service-history");
        Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
        var history = (await historyResponse.Content.ReadFromJsonAsync<List<ServiceHistoryDto>>())!;
        Assert.NotNull(history);
        // Demo closed jobs are synthetic customers; Kavitha's active job is still Inspecting.
        Assert.Empty(history);

        var filtered = await kavitha.GetAsync(
            $"/api/v1/customer/service-history?vehicleId={DemoIds.VehicleWagonR}");
        Assert.Equal(HttpStatusCode.OK, filtered.StatusCode);

        var customers = (await manager.GetFromJsonAsync<List<CustomerSummary>>(
            "/api/v1/manager/customers"))!;
        Assert.Contains(customers, c => c.Id == DemoIds.CustomerKavitha && c.Email.Contains("kavitha"));
        Assert.Contains(customers, c => c.Id == DemoIds.CustomerArun);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/customers")).StatusCode);
    }

    [Fact]
    public async Task Mechanic_profile_and_duty_toggle()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var profile = await ravi.GetFromJsonAsync<MechanicProfileDto>("/api/v1/mechanic/profile");
        Assert.NotNull(profile);
        Assert.False(string.IsNullOrWhiteSpace(profile!.Name));
        Assert.Equal("EMP-001", profile.EmployeeCode);

        var off = await ravi.PutAsJsonAsync("/api/v1/mechanic/profile/duty", new DutyRequest(false));
        Assert.Equal(HttpStatusCode.OK, off.StatusCode);
        Assert.False((await off.Content.ReadFromJsonAsync<MechanicProfileDto>())!.OnDuty);

        var on = await ravi.PutAsJsonAsync("/api/v1/mechanic/profile/duty", new DutyRequest(true));
        Assert.Equal(HttpStatusCode.OK, on.StatusCode);
        Assert.True((await on.Content.ReadFromJsonAsync<MechanicProfileDto>())!.OnDuty);
    }

    [Fact]
    public async Task Anonymous_garage_and_profile_are_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/customer/garage")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/customer/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/mechanic/profile")).StatusCode);
    }

    [Fact]
    public async Task Cross_role_cannot_read_foreign_profile_surfaces()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/mechanic/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.GetAsync("/api/v1/customer/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.GetAsync("/api/v1/customer/garage")).StatusCode);
    }
}
