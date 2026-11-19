using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

/// <summary>Phase 1 runs one branch, so there is exactly one Workshop row.</summary>
public sealed class Workshop : Entity
{
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string EmergencyPhone { get; set; } = "";
    public string Address { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public TimeOnly OpenTime { get; set; } = new(8, 0);
    public TimeOnly CloseTime { get; set; } = new(18, 0);
    public int SlotMinutes { get; set; } = 60;
    public int CancelCutoffHours { get; set; } = 2;
    public int EtaShiftNotifyMinutes { get; set; } = 20;
    public bool LoyaltyEnabled { get; set; } = true;
    public decimal LoyaltyPercent { get; set; } = 2m;
    public decimal LoyaltyCapRupees { get; set; } = 1500m;
    public decimal VatRate { get; set; } = 0m;
    /// <summary>Opening hours are local wall-clock time; all stored timestamps are UTC. Sri Lanka = +330.</summary>
    public int UtcOffsetMinutes { get; set; } = 330;

    public DateTime ToLocal(DateTime utc) => DateTime.SpecifyKind(utc.AddMinutes(UtcOffsetMinutes), DateTimeKind.Unspecified);
    public DateTime ToUtc(DateTime local) => DateTime.SpecifyKind(local.AddMinutes(-UtcOffsetMinutes), DateTimeKind.Utc);
    public bool IsOpenAt(DateTime utc)
    {
        var t = TimeOnly.FromDateTime(ToLocal(utc));
        return t >= OpenTime && t < CloseTime && ToLocal(utc).DayOfWeek != DayOfWeek.Sunday;
    }
}

public sealed class Bay : Entity
{
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class ServiceItem : Entity
{
    public string Name { get; set; } = "";
    public string Category { get; set; } = "General";
    public int StandardMinutes { get; set; } = 60;
    public decimal BasePrice { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class StaffUser : Entity
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    /// <summary>Roles.Manager or Roles.Owner.</summary>
    public string Role { get; set; } = Roles.Manager;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Manager-issued, 7-day mechanic invitation (tracker FX13-D02-NID-1).</summary>
public sealed class MechanicInvitation : Entity
{
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Token { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcceptedAt { get; set; }
    public Guid? MechanicId { get; set; }
    public DateTime? RevokedAt { get; set; }
    /// <summary>Optimistic concurrency token so two accept calls cannot bind different accounts.</summary>
    public int Version { get; set; }

    public bool IsValid(DateTime now) => AcceptedAt is null && RevokedAt is null && ExpiresAt > now;
}
