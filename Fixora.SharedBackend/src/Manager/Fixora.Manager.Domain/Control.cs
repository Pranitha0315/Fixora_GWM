using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

/// <summary>Manager mode: every hop waits for a manager. Auto mode: the system forwards and releases on its own.</summary>
public enum ControlMode { Manager, Auto }

/// <summary>One row: how the garage runs when the manager is or is not at the dashboard.</summary>
public sealed class ControlSettings : Entity
{
    /// <summary>Chosen by the manager in the header switch.</summary>
    public ControlMode Mode { get; set; } = ControlMode.Manager;
    /// <summary>In Manager mode, switch to Auto by itself when no manager has the dashboard open.</summary>
    public bool AutoWhenAway { get; set; } = true;
    /// <summary>How long nobody must be online before Auto takes over.</summary>
    public int AwayMinutes { get; set; } = 5;
    /// <summary>Proposals above this total still wait for a manager (0 = no limit).</summary>
    public decimal HoldAboveRupees { get; set; }
    public bool AutoBookings { get; set; } = true;
    public bool AutoSos { get; set; } = true;
    public Guid? UpdatedBy { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>What Auto mode did (or left for the manager) so the manager can review it on return.</summary>
public sealed class AutoActionLog : Entity
{
    public DateTime At { get; set; }
    /// <summary>proposal.forwarded, proposal.released, change.forwarded, booking.confirmed, sos.dispatched, held.</summary>
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public string Detail { get; set; } = "";
    public Guid? EntityId { get; set; }
    public Guid? JobCardId { get; set; }
    /// <summary>true = Auto mode did not act; the manager must decide.</summary>
    public bool Held { get; set; }
    public bool Seen { get; set; }
}

/// <summary>Who did it, in audit trails and progress logs.</summary>
public static class AutoPilot
{
    public const string ActorRole = "Auto";
    public static readonly Guid ActorId = new("a0700000-0000-4000-8000-000000000001");
}
