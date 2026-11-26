namespace Fixora.SharedKernel;

/// <summary>Base class for every persisted entity. Ids are GUIDs generated in code.</summary>
public abstract class Entity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}

/// <summary>Role names used in JWT claims, policies and realtime groups.</summary>
public static class Roles
{
    public const string Customer = "Customer";
    public const string Mechanic = "Mechanic";
    public const string Manager = "Manager";
    public const string Owner = "Owner";
    public const string PlatformAdmin = "PlatformAdmin";

    public static bool IsStaff(string? role) => role is Manager or Owner or PlatformAdmin;
}

/// <summary>Authorization policy names shared by all three APIs.</summary>
public static class Policies
{
    public const string Customer = "CustomerOnly";
    public const string Mechanic = "MechanicOnly";
    public const string Staff = "StaffOnly";
    public const string Owner = "OwnerOnly";
}

public interface IClock
{
    DateTime UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
