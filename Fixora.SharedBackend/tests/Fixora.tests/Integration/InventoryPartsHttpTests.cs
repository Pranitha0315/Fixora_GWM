using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Application.Staff;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("inventory-parts-http", DisableParallelization = true)]
public sealed class InventoryPartsHttpCollection;

/// <summary>
/// FX13-D11-NID-2 Slice 1 (tests-only): characterize parts list/low-stock, stock adjust,
/// reorder place/deliver HTTP. Job-linked ConsumeForJobAsync is wired from approval release
/// (not a public route) — left for workflow characterization elsewhere. No THA InventoryService
/// production edits.
/// </summary>
[Collection("inventory-parts-http")]
public sealed class InventoryPartsHttpTests
{
    private const string PartsUrl = "/api/v1/manager/inventory/parts";
    private const string OrdersUrl = "/api/v1/manager/inventory/orders";
    private const string DashboardUrl = "/api/v1/manager/dashboard";

    private static FixoraFactory NewFactory() => new();

    private static string AdjustUrl(Guid partId) => $"{PartsUrl}/{partId}/adjust";

    private static string DeliveredUrl(Guid orderId) => $"{OrdersUrl}/{orderId}/delivered";

    [Fact]
    public async Task List_includes_seeded_brake_pads_and_lowOnly_filters()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var all = (await manager.GetFromJsonAsync<List<PartDto>>(PartsUrl))!;
        var pads = all.Single(p => p.Id == DemoIds.PartBrakePads);
        Assert.Equal("Aqua front brake pads", pads.Name);
        Assert.Equal(2, pads.Quantity);
        Assert.Equal(4, pads.ReorderLevel);
        Assert.True(pads.Low);

        var oil = all.Single(p => p.Id == DemoIds.PartEngineOil);
        Assert.False(oil.Low);

        var low = (await manager.GetFromJsonAsync<List<PartDto>>($"{PartsUrl}?lowOnly=true"))!;
        Assert.Contains(low, p => p.Id == DemoIds.PartBrakePads);
        Assert.DoesNotContain(low, p => p.Id == DemoIds.PartEngineOil);
    }

    [Fact]
    public async Task Adjust_stock_updates_quantity_and_dashboard_low_stock()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var before = (await manager.GetFromJsonAsync<DashboardDto>(DashboardUrl))!;

        var down = await manager.PostAsJsonAsync(
            AdjustUrl(DemoIds.PartEngineOil),
            new StockAdjust(-12, "D11-NID-2 characterization drawdown"));
        Assert.Equal(HttpStatusCode.OK, down.StatusCode);
        var afterDown = (await down.Content.ReadFromJsonAsync<PartDto>())!;
        Assert.Equal(6, afterDown.Quantity);
        Assert.True(afterDown.Low);

        var afterDash = (await manager.GetFromJsonAsync<DashboardDto>(DashboardUrl))!;
        Assert.True(afterDash.LowStockParts >= before.LowStockParts);

        var up = await manager.PostAsJsonAsync(
            AdjustUrl(DemoIds.PartEngineOil),
            new StockAdjust(5, "restock"));
        Assert.Equal(HttpStatusCode.OK, up.StatusCode);
        Assert.Equal(11, (await up.Content.ReadFromJsonAsync<PartDto>())!.Quantity);
    }

    [Fact]
    public async Task Adjust_below_zero_returns_insufficient_stock()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.PostAsJsonAsync(
            AdjustUrl(DemoIds.PartBrakePads),
            new StockAdjust(-99, "too much"));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("insufficient_stock", error.Code);
    }

    [Fact]
    public async Task Place_order_then_deliver_increases_stock_and_blocks_double_deliver()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var before = (await manager.GetFromJsonAsync<List<PartDto>>(PartsUrl))!
            .Single(p => p.Id == DemoIds.PartBrakePads);

        var place = await manager.PostAsJsonAsync(
            OrdersUrl,
            new PartsOrderCreate(DemoIds.PartBrakePads, 10, "Jaffna Auto Parts", 3000m, null));
        Assert.Equal(HttpStatusCode.OK, place.StatusCode);
        var order = (await place.Content.ReadFromJsonAsync<PartsOrderDto>())!;
        Assert.Equal("Placed", order.Status);
        Assert.Equal(DemoIds.PartBrakePads, order.PartId);
        Assert.Equal(10, order.Qty);
        Assert.Equal("Jaffna Auto Parts", order.Dealer);

        var listed = (await manager.GetFromJsonAsync<List<PartsOrderDto>>(OrdersUrl))!;
        Assert.Contains(listed, o => o.Id == order.Id && o.Status == "Placed");

        var delivered = await manager.PostAsync(DeliveredUrl(order.Id), null);
        Assert.Equal(HttpStatusCode.OK, delivered.StatusCode);
        var done = (await delivered.Content.ReadFromJsonAsync<PartsOrderDto>())!;
        Assert.Equal("Delivered", done.Status);
        Assert.NotNull(done.DeliveredAt);

        var after = (await manager.GetFromJsonAsync<List<PartDto>>(PartsUrl))!
            .Single(p => p.Id == DemoIds.PartBrakePads);
        Assert.Equal(before.Quantity + 10, after.Quantity);

        var again = await manager.PostAsync(DeliveredUrl(order.Id), null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var error = (await again.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("order_closed", error.Code);
    }

    [Fact]
    public async Task Place_order_with_zero_qty_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.PostAsJsonAsync(
            OrdersUrl,
            new PartsOrderCreate(DemoIds.PartWiper, 0, "Dealer", 1000m, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Create_part_appears_in_list()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var sku = $"NID-D11-{Guid.NewGuid():N}"[..16];

        var create = await manager.PostAsJsonAsync(
            PartsUrl,
            new PartUpsert(sku, "NID test gasket", "Service", 8, 3, 400m, 750m));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var part = (await create.Content.ReadFromJsonAsync<PartDto>())!;
        Assert.Equal(sku, part.Sku);
        Assert.Equal(8, part.Quantity);
        Assert.False(part.Low);

        var list = (await manager.GetFromJsonAsync<List<PartDto>>(PartsUrl))!;
        Assert.Contains(list, p => p.Id == part.Id);
    }

    [Fact]
    public async Task Anonymous_list_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync(PartsUrl);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_list_inventory()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.GetAsync(PartsUrl);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Mechanic_cannot_list_or_adjust_inventory()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.Forbidden, (await ravi.GetAsync(PartsUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsJsonAsync(
                AdjustUrl(DemoIds.PartBrakePads),
                new StockAdjust(-1, "mechanic must not adjust"))).StatusCode);
    }

    [Fact]
    public async Task Mechanic_cannot_list_or_place_parts_orders()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.Forbidden, (await ravi.GetAsync(OrdersUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await ravi.PostAsJsonAsync(
                OrdersUrl,
                new PartsOrderCreate(DemoIds.PartBrakePads, 5, "Jaffna Auto Parts", 1500m, null))).StatusCode);
    }
}
