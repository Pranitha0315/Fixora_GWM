using Fixora.Customer.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Application.Common;

/// <summary>Customer-owned tables (schema "customer"): identity, vehicles, SOS, telematics, loyalty.</summary>
public interface ICustomerDb
{
    DbSet<CustomerAccount> Customers { get; }
    DbSet<EmailOtpChallenge> OtpChallenges { get; }
    DbSet<Vehicle> Vehicles { get; }
    DbSet<SosRequest> SosRequests { get; }
    DbSet<SosStatusHistory> SosHistory { get; }
    DbSet<Trip> Trips { get; }
    DbSet<VehicleWearProfile> WearProfiles { get; }
    DbSet<MaintenanceSuggestion> Suggestions { get; }
    DbSet<LoyaltyEntry> Loyalty { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

/// <summary>Sends OTP emails. Development implementation logs the code.</summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct = default);
}

public sealed class CustomerOptions
{
    /// <summary>Demo only: return the OTP in the API response so the viva can run without email.</summary>
    public bool ExposeDevOtp { get; set; } = true;
    public int OtpMinutes { get; set; } = 10;
    public int TripRetentionDays { get; set; } = 90;
    public int LoyaltyPointsPerScoreWeek { get; set; } = 100;
    /// <summary>1 point = Rs 1 for redemption.</summary>
    public decimal RupeesPerPoint { get; set; } = 1m;
    /// <summary>Heatmap privacy: a map cell is shown only when at least this many different vehicles drove there.</summary>
    public int HeatmapMinVehicles { get; set; } = 3;
}
