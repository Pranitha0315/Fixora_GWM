using Fixora.SharedKernel;

namespace Fixora.Customer.Domain;

public sealed class CustomerAccount : Entity
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool EmailVerified { get; set; }
    public string PreferredLanguage { get; set; } = "en";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Short-lived, hashed email OTP with attempt limit (NFR-03).</summary>
public sealed class EmailOtpChallenge : Entity
{
    public const int MaxAttempts = 5;

    public string Email { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public string Purpose { get; set; } = "register";
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? ConsumedAt { get; set; }

    public bool IsUsable(DateTime now) => ConsumedAt is null && ExpiresAt > now && Attempts < MaxAttempts;
}

public enum VehicleType { Car, VanSuv, ThreeWheeler, Bike }

public sealed class Vehicle : Entity
{
    public Guid CustomerId { get; set; }
    public string RegistrationNo { get; set; } = "";
    public string Make { get; set; } = "";
    public string Model { get; set; } = "";
    public int Year { get; set; }
    public VehicleType Type { get; set; } = VehicleType.Car;
    public int MileageKm { get; set; }
    public string? Color { get; set; }
    public string? Fuel { get; set; }
    /// <summary>DriveSense is opt-in per vehicle and off by default (BR-DS-01).</summary>
    public bool DriveSenseOptIn { get; set; }
    public DateTime? DriveSenseConsentAt { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public string Label => $"{Make} {Model} ({RegistrationNo})";
}
