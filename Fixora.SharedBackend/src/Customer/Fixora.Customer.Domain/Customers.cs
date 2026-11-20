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
