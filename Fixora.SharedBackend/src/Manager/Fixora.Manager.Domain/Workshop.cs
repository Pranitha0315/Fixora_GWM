using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

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

    public bool IsValid(DateTime now) => AcceptedAt is null && RevokedAt is null && ExpiresAt > now;
}
