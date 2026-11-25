using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Common;
using Fixora.Manager.Application.Staff;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("drivesense-loyalty-http", DisableParallelization = true)]
public sealed class DriveSenseLoyaltyHttpCollection;

/// <summary>
/// FX13-D09-NID-1 Slice 1 (tests-only): characterize loyalty ledger HTTP read model,
/// expiry-aware balance, and garage-owned loyalty settings. Does not edit THA weekly
/// workers, redeem production paths, or Shared_Backend-divergent files.
/// </summary>
[Collection("drivesense-loyalty-http")]
public sealed class DriveSenseLoyaltyHttpTests
{
    private const string LoyaltyUrl = "/api/v1/customer/loyalty";
    private const string SettingsUrl = "/api/v1/manager/settings";

    /// <summary>
    /// CustomerSeeder Kavitha ledger: 200+100+45-60 active; +120 expired → balance 285.
    /// </summary>
    private const int KavithaActiveBalance = 285;

    private static FixoraFactory NewFactory() => new();

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    [Fact]
    public async Task Kavitha_loyalty_returns_seeded_balance_history_and_rupees_per_point()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.GetAsync(LoyaltyUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var loyalty = (await response.Content.ReadFromJsonAsync<LoyaltyDto>())!;
        Assert.Equal(KavithaActiveBalance, loyalty.Balance);
        Assert.Equal(1m, loyalty.RupeesPerPoint);
        Assert.True(loyalty.History.Count >= 5);

        Assert.Contains(loyalty.History, h => h.Source == "drivescore:seed1" && h.Points == 200);
        Assert.Contains(loyalty.History, h => h.Source == "drivescore:seed2" && h.Points == 100);
        Assert.Contains(loyalty.History, h => h.Source == "spend:INV-DEMO-0007" && h.Points == 45);
        Assert.Contains(loyalty.History, h => h.Source == "redeem:INV-DEMO-0007" && h.Points == -60);
        Assert.Contains(loyalty.History, h => h.Source == "drivescore:seed0" && h.Points == 120);

        // Expired seed0 appears in history but is excluded from BalanceAsync.
        var expired = Assert.Single(loyalty.History, h => h.Source == "drivescore:seed0");
        Assert.NotNull(expired.ExpiresAt);
        Assert.True(expired.ExpiresAt < DateTime.UtcNow);
    }

    [Fact]
    public async Task Arun_loyalty_is_isolated_from_kavitha_ledger()
    {
        await using var factory = NewFactory();
        var arun = await ArunAsync(factory);

        var response = await arun.GetAsync(LoyaltyUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var loyalty = (await response.Content.ReadFromJsonAsync<LoyaltyDto>())!;
        Assert.Equal(0, loyalty.Balance);
        Assert.Empty(loyalty.History);
        Assert.DoesNotContain(loyalty.History, h => h.Source.StartsWith("drivescore:seed", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Anonymous_loyalty_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync(LoyaltyUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Mechanic_token_cannot_read_customer_loyalty()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.GetAsync(LoyaltyUrl);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Manager_settings_expose_garage_loyalty_percent_and_cap()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.GetAsync(SettingsUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var settings = (await response.Content.ReadFromJsonAsync<WorkshopSettingsDto>())!;
        Assert.True(settings.LoyaltyEnabled);
        Assert.Equal(2m, settings.LoyaltyPercent);
        Assert.Equal(1500m, settings.LoyaltyCapRupees);
    }

    [Fact]
    public async Task Customer_cannot_read_manager_loyalty_settings()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.GetAsync(SettingsUrl);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
