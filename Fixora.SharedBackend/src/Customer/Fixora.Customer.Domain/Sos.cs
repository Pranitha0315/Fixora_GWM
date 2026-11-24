using Fixora.SharedKernel;

namespace Fixora.Customer.Domain;

public enum SosStatus { Received, Acknowledged, Dispatched, OnSite, Resolved, Cancelled }

/// <summary>Online SOS: persisted once per idempotency key; "Delivered" only after this row exists (BR-SOS-03).</summary>
public sealed class SosRequest : Entity
{
    public Guid CustomerId { get; set; }
    public Guid? VehicleId { get; set; }
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string Category { get; set; } = "Other";
    public string? Note { get; set; }
    public SosStatus Status { get; set; } = SosStatus.Received;
    public string IdempotencyKey { get; set; } = "";
    public DateTime ReceivedAt { get; set; }
    public Guid? AcknowledgedBy { get; set; }
    public Guid? AssignedMechanicId { get; set; }
    public string? DriveSenseContext { get; set; }
    public List<SosStatusHistory> History { get; set; } = new();

    public bool IsOpen => Status is not (SosStatus.Resolved or SosStatus.Cancelled);

    private static readonly Dictionary<SosStatus, SosStatus[]> Allowed = new()
    {
        [SosStatus.Received] = new[] { SosStatus.Acknowledged, SosStatus.Dispatched, SosStatus.Cancelled },
        [SosStatus.Acknowledged] = new[] { SosStatus.Dispatched, SosStatus.Resolved, SosStatus.Cancelled },
        [SosStatus.Dispatched] = new[] { SosStatus.OnSite, SosStatus.Resolved, SosStatus.Cancelled },
        [SosStatus.OnSite] = new[] { SosStatus.Resolved },
        [SosStatus.Resolved] = Array.Empty<SosStatus>(),
        [SosStatus.Cancelled] = Array.Empty<SosStatus>(),
    };

    public void MoveTo(SosStatus next, string actorRole, Guid actorId, string? note, DateTime now)
    {
        if (!Allowed[Status].Contains(next))
            throw new ConflictException("sos_invalid_transition", $"SOS cannot move from {Status} to {next}.");
        Status = next;
        History.Add(new SosStatusHistory { SosRequestId = Id, Status = next, ActorRole = actorRole, ActorId = actorId, Note = note, At = now });
    }

    /// <summary>The customer may cancel only before a mechanic is dispatched (BR-SOS-06).</summary>
    public void CancelByCustomer(Guid customerId, DateTime now)
    {
        if (Status is not (SosStatus.Received or SosStatus.Acknowledged))
            throw new ConflictException("sos_already_dispatched", "Help is already on the way. Please call the garage to cancel.");
        MoveTo(SosStatus.Cancelled, Roles.Customer, customerId, "Cancelled by customer", now);
    }
}

public sealed class SosStatusHistory : Entity
{
    public Guid SosRequestId { get; set; }
    public SosStatus Status { get; set; }
    public string ActorRole { get; set; } = "";
    public Guid ActorId { get; set; }
    public string? Note { get; set; }
    public DateTime At { get; set; }
}
