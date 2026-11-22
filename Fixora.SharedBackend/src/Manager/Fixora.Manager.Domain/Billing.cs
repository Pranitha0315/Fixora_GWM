using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

public enum InvoiceStatus { Unpaid, Paid }

public sealed class Invoice : Entity
{
    public Guid JobCardId { get; set; }
    public Guid CustomerId { get; set; }
    public string Number { get; set; } = "";
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal LoyaltyDiscount { get; set; }
    public decimal Total { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Unpaid;
    public string? PaymentMethod { get; set; }
    public string? PaymentReference { get; set; }
    public Guid? RecordedBy { get; set; }
    public DateTime IssuedAt { get; set; }
    public DateTime? PaidAt { get; set; }
    public List<InvoiceLine> Lines { get; set; } = new();

    public void RecordPayment(string method, string? reference, Guid staffId, DateTime now)
    {
        if (Status == InvoiceStatus.Paid) throw new ConflictException("invoice_paid", "This invoice is already paid.");
        if (method is not ("Cash" or "BankTransfer"))
            throw new ValidationException("Phase 1 records cash or bank-transfer payments only.");
        Status = InvoiceStatus.Paid;
        PaymentMethod = method;
        PaymentReference = reference;
        RecordedBy = staffId;
        PaidAt = now;
    }
}

public sealed class InvoiceLine : Entity
{
    public Guid InvoiceId { get; set; }
    public string Description { get; set; } = "";
    public int Qty { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public decimal Amount { get; set; }
}

public sealed class Part : Entity
{
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public int Quantity { get; set; }
    public int ReorderLevel { get; set; } = 3;
    public decimal UnitCost { get; set; }
    public decimal SellPrice { get; set; }
    public double AvgWeeklyUsage { get; set; }

    public bool IsLow => Quantity <= ReorderLevel;

    public void Use(int qty)
    {
        if (qty <= 0) throw new ValidationException("Quantity must be above zero.");
        if (qty > Quantity) throw new ConflictException("insufficient_stock", $"Only {Quantity} × {Name} left in stock.");
        Quantity -= qty;
    }
}

public sealed class StockMovement : Entity
{
    public Guid PartId { get; set; }
    public Guid? JobCardId { get; set; }
    public int Delta { get; set; }
    public string Reason { get; set; } = "";
    public DateTime At { get; set; }
}

public enum PartsOrderStatus { Placed, Delivered, Cancelled }

public sealed class PartsOrder : Entity
{
    public Guid PartId { get; set; }
    public int Qty { get; set; }
    public string Dealer { get; set; } = "";
    public decimal UnitCost { get; set; }
    public PartsOrderStatus Status { get; set; } = PartsOrderStatus.Placed;
    public Guid? InsightId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
}

/// <summary>Platform earnings ledger: subscription, message fees and commissions (BR-SF-15).</summary>
public sealed class EarningsEntry : Entity
{
    public string Kind { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reference { get; set; } = "";
    public DateTime At { get; set; }
}
