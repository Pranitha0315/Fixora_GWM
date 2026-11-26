using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Application.Sos;
using Fixora.Customer.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// FX13-D10-NID-2: mechanic SOS responses redact lat/lng after Resolved/Cancelled;
/// manager history keeps original coordinates. DB coords are never overwritten.
/// </summary>
[Collection("sos-lifecycle-http")]
public sealed class SosMechanicLocationPrivacyHttpTests
{
    private const string CustomerSosUrl = "/api/v1/customer/sos/requests";
    private const string ManagerSosUrl = "/api/v1/manager/sos";
    private const string MechanicSosUrl = "/api/v1/mechanic/sos";

    private const double ExpectedLat = 9.6615;
    private const double ExpectedLng = 80.0255;

    private static FixoraFactory NewFactory() => new();

    private static CreateSosRequest ValidCreate(string note)
        => new(ExpectedLat, ExpectedLng, "FlatTyre", DemoIds.VehicleWagonR, note, true);

    private static async Task<SosReceipt> CreateSosAsync(HttpClient client, string note)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, CustomerSosUrl)
        {
            Content = JsonContent.Create(ValidCreate(note))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d10-priv-{Guid.NewGuid():N}");
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SosReceipt>())!;
    }

    private static async Task DispatchToRaviAsync(HttpClient manager, Guid sosId)
    {
        var dispatch = await manager.PostAsJsonAsync(
            $"{ManagerSosUrl}/{sosId}/dispatch",
            new { mechanicId = DemoIds.MechanicRavi, note = "go" });
        Assert.Equal(HttpStatusCode.OK, dispatch.StatusCode);
    }

    private static void AssertLatLngElement(JsonElement root, double? expectedLat, double? expectedLng)
    {
        Assert.True(root.TryGetProperty("lat", out var lat));
        Assert.True(root.TryGetProperty("lng", out var lng));
        if (expectedLat is null)
        {
            Assert.Equal(JsonValueKind.Null, lat.ValueKind);
            Assert.Equal(JsonValueKind.Null, lng.ValueKind);
        }
        else
        {
            Assert.Equal(JsonValueKind.Number, lat.ValueKind);
            Assert.Equal(JsonValueKind.Number, lng.ValueKind);
            Assert.Equal(expectedLat.Value, lat.GetDouble(), 4);
            Assert.Equal(expectedLng!.Value, lng.GetDouble(), 4);
        }
    }

    [Fact]
    public async Task Open_dispatched_sos_mechanic_list_keeps_original_lat_lng()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var receipt = await CreateSosAsync(kavitha, "open-coords");
        await DispatchToRaviAsync(manager, receipt.ReceiptId);

        var response = await ravi.GetAsync(MechanicSosUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var item = doc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetGuid() == receipt.ReceiptId);

        Assert.Equal("Dispatched", item.GetProperty("status").GetString());
        Assert.Equal("FlatTyre", item.GetProperty("category").GetString());
        AssertLatLngElement(item, ExpectedLat, ExpectedLng);
    }

    [Fact]
    public async Task Resolved_sos_mechanic_gets_null_lat_lng_manager_history_keeps_coords()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var receipt = await CreateSosAsync(kavitha, "resolve-privacy");
        await DispatchToRaviAsync(manager, receipt.ReceiptId);

        var resolved = await ravi.PostAsJsonAsync(
            $"{MechanicSosUrl}/{receipt.ReceiptId}/status",
            new { status = "Resolved", note = "Done" });
        Assert.Equal(HttpStatusCode.OK, resolved.StatusCode);
        var resolvedJson = await resolved.Content.ReadAsStringAsync();
        using (var resolvedDoc = JsonDocument.Parse(resolvedJson))
            AssertLatLngElement(resolvedDoc.RootElement, null, null);
        var resolvedDto = JsonSerializer.Deserialize<SosDto>(resolvedJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.Equal("Resolved", resolvedDto!.Status);
        Assert.Equal("FlatTyre", resolvedDto.Category);
        Assert.Equal(DemoIds.MechanicRavi, resolvedDto.AssignedMechanicId);
        Assert.Null(resolvedDto.Lat);
        Assert.Null(resolvedDto.Lng);

        var listResponse = await ravi.GetAsync(MechanicSosUrl);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        await using var listStream = await listResponse.Content.ReadAsStreamAsync();
        using var listDoc = await JsonDocument.ParseAsync(listStream);
        var listed = listDoc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetGuid() == receipt.ReceiptId);
        Assert.Equal("Resolved", listed.GetProperty("status").GetString());
        AssertLatLngElement(listed, null, null);

        var history = await manager.GetAsync($"{ManagerSosUrl}?openOnly=false");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        await using var histStream = await history.Content.ReadAsStreamAsync();
        using var histDoc = await JsonDocument.ParseAsync(histStream);
        var managerRow = histDoc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetGuid() == receipt.ReceiptId);
        Assert.Equal("Resolved", managerRow.GetProperty("status").GetString());
        AssertLatLngElement(managerRow, ExpectedLat, ExpectedLng);
        Assert.Equal("FlatTyre", managerRow.GetProperty("category").GetString());
    }

    [Fact]
    public async Task Cancelled_sos_mechanic_gets_null_lat_lng_manager_history_keeps_coords()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var receipt = await CreateSosAsync(kavitha, "cancel-privacy");
        await DispatchToRaviAsync(manager, receipt.ReceiptId);

        var cancelled = await ravi.PostAsJsonAsync(
            $"{MechanicSosUrl}/{receipt.ReceiptId}/status",
            new { status = "Cancelled", note = "Could not reach" });
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        var cancelledJson = await cancelled.Content.ReadAsStringAsync();
        using (var cancelledDoc = JsonDocument.Parse(cancelledJson))
            AssertLatLngElement(cancelledDoc.RootElement, null, null);
        var cancelledDto = JsonSerializer.Deserialize<SosDto>(cancelledJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.Equal("Cancelled", cancelledDto!.Status);
        Assert.Null(cancelledDto.Lat);
        Assert.Null(cancelledDto.Lng);

        var listResponse = await ravi.GetAsync(MechanicSosUrl);
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        await using var listStream = await listResponse.Content.ReadAsStreamAsync();
        using var listDoc = await JsonDocument.ParseAsync(listStream);
        var listed = listDoc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetGuid() == receipt.ReceiptId);
        AssertLatLngElement(listed, null, null);

        var history = await manager.GetAsync($"{ManagerSosUrl}?openOnly=false");
        Assert.Equal(HttpStatusCode.OK, history.StatusCode);
        await using var histStream = await history.Content.ReadAsStreamAsync();
        using var histDoc = await JsonDocument.ParseAsync(histStream);
        var managerRow = histDoc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetGuid() == receipt.ReceiptId);
        Assert.Equal("Cancelled", managerRow.GetProperty("status").GetString());
        AssertLatLngElement(managerRow, ExpectedLat, ExpectedLng);
    }
}
