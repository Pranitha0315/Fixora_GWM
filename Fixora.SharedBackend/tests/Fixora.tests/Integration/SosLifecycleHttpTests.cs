using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Sos;
using Fixora.Customer.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("sos-lifecycle-http", DisableParallelization = true)]
public sealed class SosLifecycleHttpCollection;

/// <summary>
/// FX13-D10-NID-1: customer SOS create/cancel, manager acknowledge/dispatch, mechanic
/// alert list + status, and consented DriveSense context. Location privacy (D10-NID-2)
/// is covered in SosMechanicLocationPrivacyHttpTests.
/// </summary>
[Collection("sos-lifecycle-http")]
public sealed class SosLifecycleHttpTests
{
    private const string CustomerSosUrl = "/api/v1/customer/sos/requests";
    private const string ManagerSosUrl = "/api/v1/manager/sos";
    private const string MechanicSosUrl = "/api/v1/mechanic/sos";

    private static FixoraFactory NewFactory() => new();

    private static async Task<HttpClient> KumarAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static CreateSosRequest ValidCreate(Guid? vehicleId, string note)
        => new(9.6615, 80.0255, "FlatTyre", vehicleId, note, true);

    private static async Task<SosReceipt> CreateSosAsync(HttpClient client, CreateSosRequest body, string idempotencyKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, CustomerSosUrl)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SosReceipt>())!;
    }

    [Fact]
    public async Task Create_with_consent_returns_receipt_and_customer_can_read_status()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var key = $"d10-create-{Guid.NewGuid():N}";

        var receipt = await CreateSosAsync(kavitha, ValidCreate(DemoIds.VehicleWagonR, "A9 roadside"), key);
        Assert.False(receipt.Duplicate);
        Assert.Equal("Received", receipt.Status);
        Assert.False(string.IsNullOrWhiteSpace(receipt.GaragePhone));

        var detail = await kavitha.GetFromJsonAsync<SosDto>($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.NotNull(detail);
        Assert.Equal("Received", detail!.Status);
        Assert.Equal("FlatTyre", detail.Category);
        Assert.Equal(DemoIds.CustomerKavitha, detail.CustomerId);
        Assert.Contains(detail.History, h => h.Status == "Received" && h.ActorRole == "Customer");
    }

    [Fact]
    public async Task Manager_dispatch_then_mechanic_sees_alert_and_updates_status_for_customer()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var kumar = await KumarAsync(factory);
        var receipt = await CreateSosAsync(
            kavitha,
            ValidCreate(DemoIds.VehicleWagonR, "D10 lifecycle"),
            $"d10-life-{Guid.NewGuid():N}");

        var ack = await manager.PostAsJsonAsync(
            $"{ManagerSosUrl}/{receipt.ReceiptId}/acknowledge",
            new { note = "Arranging help" });
        Assert.Equal(HttpStatusCode.OK, ack.StatusCode);
        Assert.Equal("Acknowledged", (await ack.Content.ReadFromJsonAsync<SosDto>())!.Status);

        var dispatch = await manager.PostAsJsonAsync(
            $"{ManagerSosUrl}/{receipt.ReceiptId}/dispatch",
            new { mechanicId = DemoIds.MechanicRavi, note = "Ravi go" });
        Assert.Equal(HttpStatusCode.OK, dispatch.StatusCode);
        var dispatched = (await dispatch.Content.ReadFromJsonAsync<SosDto>())!;
        Assert.Equal("Dispatched", dispatched.Status);
        Assert.Equal(DemoIds.MechanicRavi, dispatched.AssignedMechanicId);

        var raviList = (await ravi.GetFromJsonAsync<List<SosDto>>(MechanicSosUrl))!;
        Assert.Contains(raviList, s => s.Id == receipt.ReceiptId && s.Status == "Dispatched");

        var kumarList = (await kumar.GetFromJsonAsync<List<SosDto>>(MechanicSosUrl))!;
        Assert.DoesNotContain(kumarList, s => s.Id == receipt.ReceiptId);

        var onSite = await ravi.PostAsJsonAsync(
            $"{MechanicSosUrl}/{receipt.ReceiptId}/status",
            new { status = "OnSite", note = "Arrived" });
        Assert.Equal(HttpStatusCode.OK, onSite.StatusCode);

        var customerView = await kavitha.GetFromJsonAsync<SosDto>($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.Equal("OnSite", customerView!.Status);

        var resolved = await ravi.PostAsJsonAsync(
            $"{MechanicSosUrl}/{receipt.ReceiptId}/status",
            new { status = "Resolved", note = "Tyre fixed" });
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        Assert.Equal("Resolved", (await resolved.Content.ReadFromJsonAsync<SosDto>())!.Status);

        var final = await kavitha.GetFromJsonAsync<SosDto>($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.Equal("Resolved", final!.Status);
        Assert.Contains(final.History, h => h.Status == "OnSite" && h.ActorRole == "Mechanic");
        Assert.Contains(final.History, h => h.Status == "Resolved");
    }

    [Fact]
    public async Task Customer_can_cancel_before_dispatch_but_not_after()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();

        var cancelable = await CreateSosAsync(
            kavitha, ValidCreate(null, "cancel-ok"), $"d10-cancel-ok-{Guid.NewGuid():N}");
        var cancelled = await kavitha.PostAsync($"{CustomerSosUrl}/{cancelable.ReceiptId}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal("Cancelled", (await cancelled.Content.ReadFromJsonAsync<SosDto>())!.Status);

        var locked = await CreateSosAsync(
            kavitha, ValidCreate(null, "cancel-blocked"), $"d10-cancel-no-{Guid.NewGuid():N}");
        (await manager.PostAsJsonAsync(
                $"{ManagerSosUrl}/{locked.ReceiptId}/dispatch",
                new { mechanicId = DemoIds.MechanicRavi, note = "go" }))
            .EnsureSuccessStatusCode();

        var blocked = await kavitha.PostAsync($"{CustomerSosUrl}/{locked.ReceiptId}/cancel", null);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        var error = (await blocked.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("sos_already_dispatched", error.Code);
    }

    [Fact]
    public async Task Create_without_location_consent_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var request = new HttpRequestMessage(HttpMethod.Post, CustomerSosUrl)
        {
            Content = JsonContent.Create(new CreateSosRequest(
                9.6615, 80.0255, "Other", DemoIds.VehicleWagonR, "no consent", false))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d10-noconsent-{Guid.NewGuid():N}");

        var response = await kavitha.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Anonymous_create_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post, CustomerSosUrl)
        {
            Content = JsonContent.Create(ValidCreate(DemoIds.VehicleWagonR, "anon"))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d10-anon-{Guid.NewGuid():N}");

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Other_customer_cannot_read_foreign_sos()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var arun = await ArunAsync(factory);
        var receipt = await CreateSosAsync(
            kavitha, ValidCreate(DemoIds.VehicleWagonR, "foreign"), $"d10-foreign-{Guid.NewGuid():N}");

        var response = await arun.GetAsync($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Opted_in_vehicle_with_recent_trip_attaches_DriveSense_context()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var simulate = await kavitha.PostAsync(
            $"/api/v1/customer/drivesense/vehicles/{DemoIds.VehicleWagonR}/simulate", null);
        Assert.Equal(HttpStatusCode.OK, simulate.StatusCode);

        var receipt = await CreateSosAsync(
            kavitha,
            ValidCreate(DemoIds.VehicleWagonR, "with DS context"),
            $"d10-ds-{Guid.NewGuid():N}");
        var detail = await kavitha.GetFromJsonAsync<SosDto>($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.False(string.IsNullOrWhiteSpace(detail!.DriveSenseContext));
        Assert.Contains("DriveSense:", detail.DriveSenseContext!, StringComparison.Ordinal);
        Assert.Contains("pothole", detail.DriveSenseContext!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Opted_out_vehicle_sos_has_no_DriveSense_context()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var receipt = await CreateSosAsync(
            kavitha,
            ValidCreate(DemoIds.VehicleThreeWheeler, "no opt-in"),
            $"d10-nods-{Guid.NewGuid():N}");

        var detail = await kavitha.GetFromJsonAsync<SosDto>($"{CustomerSosUrl}/{receipt.ReceiptId}");
        Assert.Null(detail!.DriveSenseContext);
    }
}
