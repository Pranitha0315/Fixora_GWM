using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("manager-roster-settings-http", DisableParallelization = true)]
public sealed class ManagerRosterSettingsHttpCollection;

/// <summary>
/// Conflict-safe tests-only: manager mechanic roster + workshop settings/bays/services
/// read models. Does not change Confirm/CheckIn timing or THA production files.
/// </summary>
[Collection("manager-roster-settings-http")]
public sealed class ManagerRosterSettingsHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Mechanic_roster_lists_seeded_ravi_and_kumar()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var roster = (await manager.GetFromJsonAsync<List<MechanicRosterDto>>("/api/v1/manager/mechanics"))!;
        Assert.Contains(roster, m => m.Id == DemoIds.MechanicRavi);
        Assert.Contains(roster, m => m.Id == DemoIds.MechanicKumar);
        Assert.All(roster, m => Assert.False(string.IsNullOrWhiteSpace(m.Name)));
    }

    [Fact]
    public async Task Settings_bays_and_services_match_demo_seed()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var settings = await manager.GetFromJsonAsync<WorkshopSettingsDto>("/api/v1/manager/settings");
        Assert.NotNull(settings);
        Assert.True(settings!.LoyaltyEnabled);
        Assert.True(settings.LoyaltyPercent > 0);

        var bays = (await manager.GetFromJsonAsync<List<BayDto>>("/api/v1/manager/settings/bays"))!;
        Assert.Contains(bays, b => b.Id == DemoIds.Bay1);
        Assert.Contains(bays, b => b.Id == DemoIds.Bay2);

        var services = (await manager.GetFromJsonAsync<List<ServiceDto>>("/api/v1/manager/settings/services"))!;
        Assert.Contains(services, s => s.Id == DemoIds.ServiceBrake);
        Assert.Contains(services, s => s.Id == DemoIds.ServiceOil);
        Assert.True(services.Count >= 4);
    }

    [Fact]
    public async Task Active_jobs_list_includes_kavitha_and_arun_today()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var jobs = (await manager.GetFromJsonAsync<List<JobSummaryDto>>("/api/v1/manager/jobs?activeOnly=true"))!;
        Assert.Contains(jobs, j => j.Id == DemoIds.JobKavithaToday);
        Assert.Contains(jobs, j => j.Id == DemoIds.JobArunToday);

        var detail = await manager.GetFromJsonAsync<JobDetailDto>(
            $"/api/v1/manager/jobs/{DemoIds.JobKavithaToday}");
        Assert.Equal(DemoIds.JobKavithaToday, detail!.Job.Id);
        Assert.Equal(DemoIds.CustomerKavitha, detail.Job.CustomerId);
    }

    [Fact]
    public async Task Anonymous_and_customer_cannot_read_manager_roster_settings()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var kavitha = await factory.Customer();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/mechanics")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/settings")).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/mechanics")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/settings/bays")).StatusCode);
    }
}
