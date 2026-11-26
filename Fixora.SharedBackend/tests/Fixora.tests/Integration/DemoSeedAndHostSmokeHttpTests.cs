using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Application.Common;
using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Sos;
using Fixora.Customer.Application.Vehicles;
using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("demo-seed-host-smoke", DisableParallelization = true)]
public sealed class DemoSeedAndHostSmokeHttpCollection;

/// <summary>
/// FX13-D13-NID-1/2 Slice 1 (tests-only): host health/OpenAPI surfaces, seeded
/// FixProof/DriveSense/SOS/Advisor demo continuity across the three APIs, and a thin
/// customer→manager→mechanic SOS hand-off. No Host/Program or seeder production edits
/// (THA D13 ownership).
/// </summary>
[Collection("demo-seed-host-smoke")]
public sealed class DemoSeedAndHostSmokeHttpTests
{
    private static readonly string[] RequiredOpenApiFragments =
    {
        "/api/v1/customer/",
        "/api/v1/mechanic/",
        "/api/v1/manager/",
        "/api/v1/customer/sos/requests",
        "/api/v1/customer/drivesense",
        "/api/v1/customer/suggestions",
        "/api/v1/manager/advisor",
        "/api/v1/manager/billing",
        "/api/v1/mechanic/jobs",
    };

    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Host_root_health_and_openapi_expose_three_api_surfaces()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var root = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, root.StatusCode);
        using var rootDoc = JsonDocument.Parse(await root.Content.ReadAsStringAsync());
        var rootJson = rootDoc.RootElement;
        Assert.Equal("Fixora API", rootJson.GetProperty("name").GetString());
        var surfaces = rootJson.GetProperty("surfaces").EnumerateArray().Select(e => e.GetString()).ToArray();
        Assert.Contains("/api/v1/customer", surfaces);
        Assert.Contains("/api/v1/mechanic", surfaces);
        Assert.Contains("/api/v1/manager", surfaces);
        Assert.Equal("/hubs/fixora", rootJson.GetProperty("realtime").GetString());
        Assert.Equal("/openapi/v1.json", rootJson.GetProperty("openApi").GetString());

        var health = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);

        var openApi = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, openApi.StatusCode);
        var openApiText = await openApi.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(openApiText));
        foreach (var fragment in RequiredOpenApiFragments)
        {
            Assert.Contains(fragment, openApiText, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Seeded_demo_data_is_visible_on_customer_mechanic_and_manager_apis()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();

        var vehicles = (await kavitha.GetFromJsonAsync<List<VehicleDto>>("/api/v1/customer/vehicles"))!;
        Assert.Contains(vehicles, v => v.Id == DemoIds.VehicleWagonR && v.DriveSenseOptIn);
        Assert.Contains(vehicles, v => v.Id == DemoIds.VehicleThreeWheeler && !v.DriveSenseOptIn);

        var suggestions = (await kavitha.GetFromJsonAsync<List<SuggestionDto>>("/api/v1/customer/suggestions"))!;
        Assert.Contains(suggestions, s => s.Status == "Open" && s.Component == "Suspension");

        var loyalty = (await kavitha.GetFromJsonAsync<LoyaltyDto>("/api/v1/customer/loyalty"))!;
        Assert.Equal(285, loyalty.Balance);

        var home = await kavitha.GetAsync("/api/v1/customer/home");
        Assert.Equal(HttpStatusCode.OK, home.StatusCode);
        using var homeDoc = JsonDocument.Parse(await home.Content.ReadAsStringAsync());
        var activeJobs = homeDoc.RootElement.GetProperty("activeJobs");
        Assert.True(activeJobs.GetArrayLength() >= 1);

        var job = await ravi.GetFromJsonAsync<MechanicJobDetailDto>(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}");
        Assert.NotNull(job);
        Assert.Equal(DemoIds.JobKavithaToday, job!.Detail.Job.Id);
        Assert.NotNull(job.DriveSense);
        Assert.Equal(DemoIds.VehicleWagonR, job.DriveSense!.VehicleId);

        var dash = (await manager.GetFromJsonAsync<DashboardDto>("/api/v1/manager/dashboard"))!;
        Assert.True(dash.ActiveJobs >= 1);
        Assert.True(dash.LowStockParts >= 1);

        var lowParts = (await manager.GetFromJsonAsync<List<PartDto>>(
            "/api/v1/manager/inventory/parts?lowOnly=true"))!;
        Assert.Contains(lowParts, p => p.Id == DemoIds.PartBrakePads);

        var metrics = (await manager.GetFromJsonAsync<WeeklyMetrics>("/api/v1/manager/advisor/metrics"))!;
        Assert.Contains(metrics.Stock, s => s.PartId == DemoIds.PartBrakePads);
    }

    [Fact]
    public async Task Three_api_sos_handoff_uses_seeded_roles_end_to_end()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var key = $"d13-smoke-{Guid.NewGuid():N}";

        var create = new HttpRequestMessage(HttpMethod.Post, "/api/v1/customer/sos/requests")
        {
            Content = JsonContent.Create(new CreateSosRequest(
                9.6615, 80.0255, "FlatTyre", DemoIds.VehicleWagonR, "D13 seed smoke", true))
        };
        create.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        var receiptResponse = await kavitha.SendAsync(create);
        Assert.Equal(HttpStatusCode.OK, receiptResponse.StatusCode);
        var receipt = (await receiptResponse.Content.ReadFromJsonAsync<SosReceipt>())!;
        Assert.Equal("Received", receipt.Status);

        var open = (await manager.GetFromJsonAsync<List<SosDto>>("/api/v1/manager/sos?openOnly=true"))!;
        Assert.Contains(open, s => s.Id == receipt.ReceiptId);

        (await manager.PostAsJsonAsync(
                $"/api/v1/manager/sos/{receipt.ReceiptId}/dispatch",
                new { mechanicId = DemoIds.MechanicRavi, note = "D13" }))
            .EnsureSuccessStatusCode();

        var mine = (await ravi.GetFromJsonAsync<List<SosDto>>("/api/v1/mechanic/sos"))!;
        Assert.Contains(mine, s => s.Id == receipt.ReceiptId && s.Status == "Dispatched");

        var customerView = await kavitha.GetFromJsonAsync<SosDto>(
            $"/api/v1/customer/sos/requests/{receipt.ReceiptId}");
        Assert.Equal("Dispatched", customerView!.Status);
        Assert.Equal(DemoIds.MechanicRavi, customerView.AssignedMechanicId);
    }

    [Fact]
    public async Task Cross_role_tokens_cannot_call_foreign_api_surfaces()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.GetAsync("/api/v1/manager/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await manager.GetAsync("/api/v1/customer/loyalty")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync($"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}")).StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_read_seeded_customer_or_manager_data()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/customer/home")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync($"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}")).StatusCode);
    }

    [Fact]
    public async Task Seeded_demo_fallback_paths_answer_without_ai_keys()
    {
        // FX13-D13-NID-2 fallback hardening: test host has no Gemini key, so every AI-backed
        // surface must answer via its deterministic fallback (template/manual) and never 500.
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();

        var advisor = await manager.PostAsJsonAsync(
            "/api/v1/manager/advisor/chat", new ChatRequest("What is this week revenue?"));
        Assert.Equal(HttpStatusCode.OK, advisor.StatusCode);
        var revenue = (await advisor.Content.ReadFromJsonAsync<ChatAnswer>())!;
        Assert.NotEqual("ai", revenue.Intent);
        Assert.Equal("revenue", revenue.Intent);
        Assert.False(string.IsNullOrWhiteSpace(revenue.Answer));

        var unknown = await manager.PostAsJsonAsync(
            "/api/v1/manager/advisor/chat", new ChatRequest("tell me a joke"));
        Assert.Equal(HttpStatusCode.OK, unknown.StatusCode);
        Assert.Equal("unknown", (await unknown.Content.ReadFromJsonAsync<ChatAnswer>())!.Intent);

        var draftUrl = $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/drafts";
        var templated = await ravi.PostAsJsonAsync(draftUrl, new
        {
            component = "Brake pads",
            transcript = "pad thickness low, disc scored",
            language = "en",
            severity = "Urgent",
            mediaRefs = Array.Empty<string>()
        });
        Assert.Equal(HttpStatusCode.OK, templated.StatusCode);
        using (var doc = JsonDocument.Parse(await templated.Content.ReadAsStringAsync()))
        {
            Assert.Equal("template", doc.RootElement.GetProperty("source").GetString());
            Assert.False(doc.RootElement.GetProperty("verified").GetBoolean());
            Assert.Equal("Draft", doc.RootElement.GetProperty("status").GetString());
        }

        var manual = await ravi.PostAsJsonAsync(draftUrl, new
        {
            component = "Brake pads",
            transcript = "",
            language = "en",
            severity = "Urgent",
            mediaRefs = Array.Empty<string>()
        });
        Assert.Equal(HttpStatusCode.OK, manual.StatusCode);
        using var manualDoc = JsonDocument.Parse(await manual.Content.ReadAsStringAsync());
        Assert.Equal("manual", manualDoc.RootElement.GetProperty("source").GetString());
    }
}
