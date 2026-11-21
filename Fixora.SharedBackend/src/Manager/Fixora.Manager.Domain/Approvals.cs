using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

/// <summary>
/// Mechanic → Manager → Customer → Manager → Mechanic.
/// <code>
///  PendingManagerReview ──forward──▶ AwaitingCustomer ──all items decided──▶ CustomerResponded ──release──▶ ReleasedToMechanic
///          │                              ▲      │
///          └──return──▶ ReturnedToMechanic │      └── manager revises a price/qty → item back to AwaitingCustomer (BR-FP-08)
/// </code>
/// The customer never sees a proposal before the manager forwards it, and the mechanic never
/// starts customer-approved work before the manager releases it.
/// </summary>
public enum ProposalStatus { PendingManagerReview, ReturnedToMechanic, AwaitingCustomer, CustomerResponded, ReleasedToMechanic, Cancelled }

public enum RepairItemStatus { Proposed, AwaitingCustomer, Approved, Rejected, Released }

public enum RepairItemKind { Part, Labour }

public sealed class RepairProposal : Entity
{
    public Guid JobCardId { get; set; }
    public Guid MechanicId { get; set; }
    public ProposalStatus Status { get; set; } = ProposalStatus.PendingManagerReview;
    public string? MechanicNote { get; set; }
    public string? ManagerNote { get; set; }
    public string? CustomerNote { get; set; }
    public DateTime SubmittedAt { get; set; }
    public Guid? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
    public DateTime? RespondedAt { get; set; }
    public Guid? ReleasedBy { get; set; }
    public DateTime? ReleasedAt { get; set; }
    public int ReportVersion { get; set; } = 1;
    public List<RepairItem> Items { get; set; } = new();

    public decimal Total => Items.Sum(i => i.Amount);
    public decimal ApprovedTotal => Items.Where(i => i.Status is RepairItemStatus.Approved or RepairItemStatus.Released).Sum(i => i.Amount);

    public static RepairProposal Submit(Guid jobCardId, Guid mechanicId, string? note, IEnumerable<RepairItem> items, DateTime now)
    {
        var list = items.ToList();
        if (list.Count == 0) throw new ValidationException("Add at least one repair item.");
        if (list.Any(i => i.Qty <= 0 || i.UnitPrice < 0 || string.IsNullOrWhiteSpace(i.Title)))
            throw new ValidationException("Every item needs a title, a quantity above zero and a price.");

        var p = new RepairProposal
        {
            JobCardId = jobCardId,
            MechanicId = mechanicId,
            MechanicNote = note,
            SubmittedAt = now,
            Status = ProposalStatus.PendingManagerReview,
        };
        foreach (var i in list)
        {
            i.ProposalId = p.Id;
            i.JobCardId = jobCardId;
            i.Status = RepairItemStatus.Proposed;
            i.Version = 1;
            p.Items.Add(i);
        }
        return p;
    }

    /// <summary>Manager may correct prices before forwarding; mechanic never sets the final price alone.</summary>
    public void SetPriceBeforeForward(Guid itemId, decimal unitPrice, int qty)
    {
        Require(ProposalStatus.PendingManagerReview, "Prices can only be edited while the proposal is with the manager.");
        var item = Item(itemId);
        if (qty <= 0 || unitPrice < 0) throw new ValidationException("Quantity must be above zero and price cannot be negative.");
        item.UnitPrice = unitPrice;
        item.Qty = qty;
    }

    public void ForwardToCustomer(Guid managerId, string? note, DateTime now)
    {
        Require(ProposalStatus.PendingManagerReview, "Only a proposal waiting for manager review can be sent to the customer.");
        Status = ProposalStatus.AwaitingCustomer;
        ManagerNote = note;
        ReviewedBy = managerId;
        ReviewedAt = now;
        PublishedAt = now;
        foreach (var i in Items) i.Status = RepairItemStatus.AwaitingCustomer;
    }

    public void ReturnToMechanic(Guid managerId, string note, DateTime now)
    {
        Require(ProposalStatus.PendingManagerReview, "Only a proposal waiting for manager review can be returned.");
        if (string.IsNullOrWhiteSpace(note)) throw new ValidationException("Tell the mechanic why the proposal is returned.");
        Status = ProposalStatus.ReturnedToMechanic;
        ManagerNote = note;
        ReviewedBy = managerId;
        ReviewedAt = now;
    }

    /// <summary>Atomic per-item decision with a version check. Returns true when every item is decided.</summary>
    public bool Decide(Guid itemId, bool approve, int version, DateTime now)
    {
        Require(ProposalStatus.AwaitingCustomer, "This proposal is not waiting for your approval.");
        var item = Item(itemId);
        if (item.Status != RepairItemStatus.AwaitingCustomer)
            throw new ConflictException("item_already_decided", $"'{item.Title}' was already decided.");
        if (item.Version != version)
            throw new ConflictException("item_version_changed", $"The price of '{item.Title}' changed. Please review the new amount.");

        item.Status = approve ? RepairItemStatus.Approved : RepairItemStatus.Rejected;
        item.DecidedAt = now;

        if (Items.All(i => i.Status is RepairItemStatus.Approved or RepairItemStatus.Rejected or RepairItemStatus.Released))
        {
            Status = ProposalStatus.CustomerResponded;
            RespondedAt = now;
            return true;
        }
        return false;
    }

    public IReadOnlyList<RepairItem> Release(Guid managerId, string? note, DateTime now)
    {
        Require(ProposalStatus.CustomerResponded, "The customer has not answered every item yet.");
        var released = new List<RepairItem>();
        foreach (var i in Items.Where(i => i.Status == RepairItemStatus.Approved))
        {
            i.Status = RepairItemStatus.Released;
            released.Add(i);
        }
        Status = ProposalStatus.ReleasedToMechanic;
        ReleasedBy = managerId;
        ReleasedAt = now;
        if (!string.IsNullOrWhiteSpace(note)) ManagerNote = note;
        return released;
    }

    /// <summary>
    /// BR-FP-08: a change of cost or scope after approval needs renewed customer approval.
    /// The item version increases, so a stale customer decision returns 409.
    /// </summary>
    /// <returns>true when the customer must approve the item again.</returns>
    public bool ReviseItem(Guid itemId, decimal unitPrice, int qty, decimal tolerance, DateTime now)
    {
        if (Status is ProposalStatus.Cancelled or ProposalStatus.ReturnedToMechanic or ProposalStatus.PendingManagerReview)
            throw new ConflictException("proposal_not_published", "Edit prices before forwarding instead.");
        var item = Item(itemId);
        if (qty <= 0 || unitPrice < 0) throw new ValidationException("Quantity must be above zero and price cannot be negative.");

        var oldAmount = item.Amount;
        var oldQty = item.Qty;
        var newAmount = unitPrice * qty;
        item.UnitPrice = unitPrice;
        item.Qty = qty;
        item.Version++;

        var increase = oldAmount == 0 ? (newAmount > 0 ? 1m : 0m) : (newAmount - oldAmount) / oldAmount;
        var wasAccepted = item.Status is RepairItemStatus.Approved or RepairItemStatus.Released;
        var needsApproval = !wasAccepted || qty != oldQty || increase > tolerance;

        if (needsApproval)
        {
            item.Status = RepairItemStatus.AwaitingCustomer;
            item.DecidedAt = null;
            Status = ProposalStatus.AwaitingCustomer;
            RespondedAt = null;
        }
        return needsApproval;
    }

    private RepairItem Item(Guid id) => Items.FirstOrDefault(i => i.Id == id) ?? throw new NotFoundException("Repair item");

    private void Require(ProposalStatus expected, string message)
    {
        if (Status != expected) throw new ConflictException("proposal_wrong_state", message);
    }
}

public sealed class RepairItem : Entity
{
    public Guid ProposalId { get; set; }
    public Guid JobCardId { get; set; }
    public string Title { get; set; } = "";
    public RepairItemKind Kind { get; set; }
    public int Qty { get; set; } = 1;
    public decimal UnitPrice { get; set; }
    public int Version { get; set; } = 1;
    public RepairItemStatus Status { get; set; } = RepairItemStatus.Proposed;
    public Guid? LinkedIssueId { get; set; }
    public Guid? PartId { get; set; }
    public DateTime? DecidedAt { get; set; }

    public decimal Amount => Qty * UnitPrice;
}

/// <summary>Immutable audit row for every customer decision (BR-FP-09).</summary>
public sealed class ApprovalDecisionRecord : Entity
{
    public Guid ProposalId { get; set; }
    public Guid RepairItemId { get; set; }
    public Guid CustomerId { get; set; }
    public bool Approved { get; set; }
    public int ItemVersion { get; set; }
    public decimal Amount { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public DateTime DecidedAt { get; set; }
}

/// <summary>Timeline of who moved the proposal and when (manager, mechanic, customer).</summary>
public sealed class ApprovalAuditEntry : Entity
{
    public Guid ProposalId { get; set; }
    public Guid JobCardId { get; set; }
    public string ActorRole { get; set; } = "";
    public Guid ActorId { get; set; }
    public string Action { get; set; } = "";
    public string? Detail { get; set; }
    public DateTime At { get; set; }
}

/// <summary>
/// Customer → Manager → Mechanic: a customer asks for a change (different part, add a wash,
/// keep old parts...). The manager decides; only forwarded requests reach the mechanic.
/// </summary>
public enum ChangeRequestStatus { PendingManagerReview, ForwardedToMechanic, Declined, Acknowledged }

public sealed class CustomerChangeRequest : Entity
{
    public Guid JobCardId { get; set; }
    public Guid CustomerId { get; set; }
    public string Number { get; set; } = "";
    public string ChangesPipe { get; set; } = "";
    public string Details { get; set; } = "";
    public ChangeRequestStatus Status { get; set; } = ChangeRequestStatus.PendingManagerReview;
    public string? ManagerNote { get; set; }
    public string? MechanicNote { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public DateTime? AcknowledgedAt { get; set; }

    public IReadOnlyList<string> Changes => ChangesPipe.Split('|', StringSplitOptions.RemoveEmptyEntries);

    public void Forward(string? note, DateTime now)
    {
        if (Status != ChangeRequestStatus.PendingManagerReview)
            throw new ConflictException("change_wrong_state", "This request was already handled.");
        Status = ChangeRequestStatus.ForwardedToMechanic;
        ManagerNote = note;
        DecidedAt = now;
    }

    public void Decline(string note, DateTime now)
    {
        if (Status != ChangeRequestStatus.PendingManagerReview)
            throw new ConflictException("change_wrong_state", "This request was already handled.");
        if (string.IsNullOrWhiteSpace(note)) throw new ValidationException("Give the customer a reason.");
        Status = ChangeRequestStatus.Declined;
        ManagerNote = note;
        DecidedAt = now;
    }

    public void Acknowledge(string? note, DateTime now)
    {
        if (Status != ChangeRequestStatus.ForwardedToMechanic)
            throw new ConflictException("change_not_forwarded", "The manager has not forwarded this request.");
        Status = ChangeRequestStatus.Acknowledged;
        MechanicNote = note;
        AcknowledgedAt = now;
    }
}
