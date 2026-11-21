using Fixora.SharedKernel;

namespace Fixora.Customer.Domain;

/// <summary>On-device trip summary. Raw GPS traces are never uploaded or stored (BR-DS-04, NFR-05).</summary>
public sealed class Trip : Entity
{
    public Guid CustomerId { get; set; }
    public Guid VehicleId { get; set; }
    public DateTime StartedAt { get; set; }
    public double DistanceKm { get; set; }
    public double RoughKm { get; set; }
    public int PotholeCount { get; set; }
    public int HarshBrakes { get; set; }
    public int HarshAccels { get; set; }
    public int SharpCorners { get; set; }
    public int Score { get; set; }
    public double Confidence { get; set; }
    public string SegmentGeohashesCsv { get; set; } = "";
    public bool IsDemoReplay { get; set; }
    public DateTime UploadedAt { get; set; }
}

public sealed class VehicleWearProfile : Entity
{
    public Guid VehicleId { get; set; }
    public DateOnly WeekStart { get; set; }
    public double RoughRoadPct { get; set; }
    public int PotholeHits { get; set; }
    public int DriveScore { get; set; } = 100;
    public double HarshBrakesPer100Km { get; set; }
    public double HarshAccelsPer100Km { get; set; }
    public double DistanceKm { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public enum SuggestionStatus { Open, Booked, Dismissed }

public sealed class MaintenanceSuggestion : Entity
{
    public Guid CustomerId { get; set; }
    public Guid VehicleId { get; set; }
    public string Component { get; set; } = "";
    public string Reason { get; set; } = "";
    public double WearFactor { get; set; }
    public Guid SuggestedServiceId { get; set; }
    public SuggestionStatus Status { get; set; } = SuggestionStatus.Open;
    public Guid? AppointmentId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
}

/// <summary>Pure DriveSense rules (BRD §9): vehicle multipliers, trip scoring, wear factors, suggestions.</summary>
public static class DriveSenseRules
{
    public static double VehicleMultiplier(VehicleType t) => t switch
    {
        VehicleType.Car => 1.0,
        VehicleType.VanSuv => 1.3,
        VehicleType.ThreeWheeler => 1.8,
        VehicleType.Bike => 2.2,
        _ => 1.0,
    };

    /// <summary>Low-confidence trips are ignored.</summary>
    public const double MinConfidence = 0.6;

    /// <summary>100 minus penalties per event, per 10 km; bounded 0..100.</summary>
    public static int TripScore(double distanceKm, int harshBrakes, int harshAccels, int sharpCorners, int potholes)
    {
        var per10 = Math.Max(1.0, distanceKm / 10.0);
        var penalty = (harshBrakes * 5 + harshAccels * 3 + sharpCorners * 2) / per10 + potholes * 0.5 / per10;
        return (int)Math.Clamp(Math.Round(100 - penalty), 0, 100);
    }

    public sealed record ComponentRule(string Component, string Explanation, Guid ServiceId, double Factor);

    /// <summary>
    /// Default rule set: rough road ≥ 60% → suspension 40% early; high harsh braking → brake pads 30% early;
    /// hard acceleration → clutch / engine mount check. Factors are scaled by the vehicle type.
    /// </summary>
    public static IReadOnlyList<ComponentRule> Evaluate(VehicleWearProfile p, VehicleType type, Guid brakeService, Guid suspensionService, Guid diagnosisService)
    {
        var mult = VehicleMultiplier(type);
        var rules = new List<ComponentRule>();
        if (p.HarshBrakesPer100Km >= 8)
        {
            var factor = Math.Round(1 + Math.Min(1.0, p.HarshBrakesPer100Km / 20.0) * mult * 0.5, 1);
            rules.Add(new ComponentRule("Brake pads", $"Brake inspection recommended — your braking pattern shows {factor:0.0}× pad wear", brakeService, factor));
        }
        if (p.RoughRoadPct >= 60)
        {
            var factor = Math.Round(1.4 * mult, 1);
            rules.Add(new ComponentRule("Suspension", $"Suspension check recommended — {p.RoughRoadPct:0}% of your driving was on rough roads", suspensionService, factor));
        }
        if (p.HarshAccelsPer100Km >= 10)
            rules.Add(new ComponentRule("Clutch / engine mounts", "Clutch and engine mount check recommended — frequent hard acceleration", diagnosisService, Math.Round(1.2 * mult, 1)));
        return rules;
    }
}
