using Fixora.Manager.Application.Common;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Inventory;

public sealed record PartDto(Guid Id, string Sku, string Name, string Category, int Quantity, int ReorderLevel, decimal UnitCost, decimal SellPrice, bool Low, double DaysLeft);
public sealed record PartUpsert(string Sku, string Name, string Category, int Quantity, int ReorderLevel, decimal UnitCost, decimal SellPrice);
public sealed record StockAdjust(int Delta, string Reason);
public sealed record PartsOrderCreate(Guid PartId, int Qty, string Dealer, decimal UnitCost, Guid? InsightId);
public sealed record PartsOrderDto(Guid Id, Guid PartId, string PartName, int Qty, string Dealer, decimal UnitCost, string Status, DateTime CreatedAt, DateTime? DeliveredAt);

public sealed class InventoryService(IManagerDb db, INotificationService notifier, IClock clock)
{
    public const decimal PartsCommissionRate = 0.06m;

    public async Task<IReadOnlyList<PartDto>> ListAsync(bool lowOnly, CancellationToken ct = default)
    {
        var parts = await db.Parts.AsNoTracking().OrderBy(p => p.Category).ThenBy(p => p.Name).ToListAsync(ct);
        return parts.Where(p => !lowOnly || p.IsLow).Select(ToDto).ToList();
    }

    public async Task<PartDto> UpsertAsync(Guid? id, PartUpsert req, CancellationToken ct = default)
    {
        Guard.Against(string.IsNullOrWhiteSpace(req.Name), "Part name is required.");
        Part part;
        if (id is null) { part = new Part(); db.Parts.Add(part); }
        else part = await db.Parts.FirstOrDefaultAsync(p => p.Id == id, ct) ?? throw new NotFoundException("Part");
        part.Sku = req.Sku; part.Name = req.Name; part.Category = req.Category; part.Quantity = Math.Max(0, req.Quantity);
        part.ReorderLevel = req.ReorderLevel; part.UnitCost = req.UnitCost; part.SellPrice = req.SellPrice;
        await db.SaveChangesAsync(ct);
        return ToDto(part);
    }

    public async Task<PartDto> AdjustAsync(Guid partId, StockAdjust req, CancellationToken ct = default)
    {
        var part = await db.Parts.FirstOrDefaultAsync(p => p.Id == partId, ct) ?? throw new NotFoundException("Part");
        if (part.Quantity + req.Delta < 0) throw new ConflictException("insufficient_stock", "Stock cannot go below zero.");
        part.Quantity += req.Delta;
        db.StockMovements.Add(new StockMovement { PartId = part.Id, Delta = req.Delta, Reason = req.Reason, At = clock.UtcNow });
        await db.SaveChangesAsync(ct);
        await AfterChangeAsync(part, ct);
        return ToDto(part);
    }

    /// <summary>Approved repair parts usage → stock ledger (tracker FX13-D11-NID-2). Saved by the caller.</summary>
    public async Task ConsumeForJobAsync(Guid partId, int qty, Guid jobId, string reason, CancellationToken ct = default)
    {
        var part = await db.Parts.FirstOrDefaultAsync(p => p.Id == partId, ct);
        if (part is null) return;
        part.Use(Math.Min(qty, part.Quantity));
        db.StockMovements.Add(new StockMovement { PartId = part.Id, JobCardId = jobId, Delta = -qty, Reason = reason, At = clock.UtcNow });
        if (part.IsLow)
            await notifier.NotifyAsync(new NotificationMessage(
                    NotificationTypes.LowStock, "Low stock", $"{part.Name}: {part.Quantity} left (reorder at {part.ReorderLevel}).", "part", part.Id),
                new[] { Recipient.AllStaff() }, ct);
    }

    public async Task<PartsOrderDto> PlaceOrderAsync(PartsOrderCreate req, CancellationToken ct = default)
    {
        Guard.Against(req.Qty <= 0, "Quantity must be above zero.");
        var part = await db.Parts.FirstOrDefaultAsync(p => p.Id == req.PartId, ct) ?? throw new NotFoundException("Part");
        var now = clock.UtcNow;
        var order = new PartsOrder { PartId = part.Id, Qty = req.Qty, Dealer = req.Dealer, UnitCost = req.UnitCost > 0 ? req.UnitCost : part.UnitCost, InsightId = req.InsightId, CreatedAt = now };
        db.PartsOrders.Add(order);
        db.Earnings.Add(new EarningsEntry { Kind = "PartsCommission", Amount = Math.Round(order.Qty * order.UnitCost * PartsCommissionRate, 2), Reference = $"Parts order {part.Name} × {order.Qty}", At = now });
        await db.SaveChangesAsync(ct);
        return new PartsOrderDto(order.Id, part.Id, part.Name, order.Qty, order.Dealer, order.UnitCost, order.Status.ToString(), order.CreatedAt, null);
    }

    public async Task<PartsOrderDto> MarkDeliveredAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await db.PartsOrders.FirstOrDefaultAsync(o => o.Id == orderId, ct) ?? throw new NotFoundException("Parts order");
        if (order.Status != PartsOrderStatus.Placed) throw new ConflictException("order_closed", "This order is already closed.");
        var part = await db.Parts.FirstAsync(p => p.Id == order.PartId, ct);
        order.Status = PartsOrderStatus.Delivered;
        order.DeliveredAt = clock.UtcNow;
        part.Quantity += order.Qty;
        db.StockMovements.Add(new StockMovement { PartId = part.Id, Delta = order.Qty, Reason = $"Delivery from {order.Dealer}", At = clock.UtcNow });
        await db.SaveChangesAsync(ct);
        await AfterChangeAsync(part, ct);
        return new PartsOrderDto(order.Id, part.Id, part.Name, order.Qty, order.Dealer, order.UnitCost, order.Status.ToString(), order.CreatedAt, order.DeliveredAt);
    }

    public async Task<IReadOnlyList<PartsOrderDto>> ListOrdersAsync(CancellationToken ct = default)
    {
        var parts = await db.Parts.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var orders = await db.PartsOrders.AsNoTracking().OrderByDescending(o => o.CreatedAt).Take(100).ToListAsync(ct);
        return orders.Select(o => new PartsOrderDto(o.Id, o.PartId, parts.GetValueOrDefault(o.PartId, "?"), o.Qty, o.Dealer, o.UnitCost, o.Status.ToString(), o.CreatedAt, o.DeliveredAt)).ToList();
    }

    private async Task AfterChangeAsync(Part part, CancellationToken ct)
        => await notifier.PublishAsync(RealtimeEvents.InventoryUpdated, ToDto(part), new[] { RealtimeGroups.Staff }, ct);

    public static PartDto ToDto(Part p) => new(p.Id, p.Sku, p.Name, p.Category, p.Quantity, p.ReorderLevel, p.UnitCost, p.SellPrice, p.IsLow,
        p.AvgWeeklyUsage <= 0 ? 99 : Math.Round(p.Quantity / (p.AvgWeeklyUsage / 7.0), 1));
}
