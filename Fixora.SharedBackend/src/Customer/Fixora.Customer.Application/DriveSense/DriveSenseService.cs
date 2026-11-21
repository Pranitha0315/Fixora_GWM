using Fixora.Customer.Application.Common;
using Fixora.Customer.Domain;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fixora.Customer.Application.DriveSense;

public sealed record TripSummaryUpload(
    Guid VehicleId,
    DateTime StartedAt,
    double DistanceKm,
    double RoughKm,
    int PotholeCount,
    int HarshBrakes,
    int HarshAccels,
    int SharpCorners,
    double Confidence,
    IReadOnlyList<string>? SegmentGeohashes);

public sealed record TripDto(Guid Id, Guid VehicleId, DateTime StartedAt, double DistanceKm, int PotholeCount, int HarshBrakes, int HarshAccels, int SharpCorners, int Score, double Confidence, bool Counted);
public sealed record WeeklyScoreDto(DateOnly WeekStart, int DriveScore, double RoughRoadPct, int PotholeHits, double DistanceKm);
public sealed record SuggestionDto(Guid Id, Guid VehicleId, string Component, string Reason, double WearFactor, Guid SuggestedServiceId, string Status, DateTime CreatedAt);
public sealed record DriveSenseSummaryDto(Guid VehicleId, bool OptedIn, int CurrentScore, double RoughRoadPct, int PotholeHits, IReadOnlyList<WeeklyScoreDto> History, IReadOnlyList<SuggestionDto> OpenSuggestions, int LoyaltyPoints);
public sealed record ReplayResult(TripDto Trip, int ScoreBefore, int ScoreAfter, IReadOnlyList<SuggestionDto> NewSuggestions);
public sealed record BookSuggestionRequest(DateTime SlotStart);

/// <summary>
/// DriveSense (USP 2): trip summaries in → weekly wear profile → rule engine → one open suggestion per component →
/// one-tap booking (USP 5) → loyalty points for gentle drivers.
/// </summary>
public sealed class DriveSenseService(
    ICustomerDb db,
    INotificationService notifier,
    IWorkshopGateway workshop,
    IOptions<CustomerOptions> options,
    IClock clock)
{
    // Workshop services the rule engine suggests (seeded ids; see DemoIds).
    public static Guid BrakeServiceId { get; set; } = Guid.Parse("60000000-0000-0000-0000-000000000002");
    public static Guid SuspensionServiceId { get; set; } = Guid.Parse("60000000-0000-0000-0000-000000000005");
    public static Guid DiagnosisServiceId { get; set; } = Guid.Parse("60000000-0000-0000-0000-000000000006");

    /// <summary>Upload trip summaries — only opted-in vehicles (BR-DS-01).</summary>
    public async Task<IReadOnlyList<TripDto>> UploadAsync(Guid customerId, IReadOnlyList<TripSummaryUpload> trips, CancellationToken ct = default)
    {
        Guard.Against(trips.Count == 0 || trips.Count > 100, "Upload between 1 and 100 trip summaries.");
        var result = new List<TripDto>();
        foreach (var t in trips)
        {
            var vehicle = await OptedInVehicleAsync(customerId, t.VehicleId, ct);
            result.Add(ToDto(AddTrip(customerId, vehicle, t, false)));
        }
        await db.SaveChangesAsync(ct);
        foreach (var vehicleId in trips.Select(t => t.VehicleId).Distinct())
            await RecomputeWeekAsync(vehicleId, ct);
        await db.SaveChangesAsync(ct);
        return result;
    }

    /// <summary>
    /// "Simulate drive" (BR-DS-17): replays the recorded Jaffna demo trip — 8 km, 14 potholes, 3 harsh brakes —
    /// then runs the weekly rules immediately so the viva sees score 100 → 72 and the brake suggestion.
    /// </summary>
    public async Task<ReplayResult> ReplayDemoAsync(Guid customerId, Guid vehicleId, CancellationToken ct = default)
    {
        var vehicle = await OptedInVehicleAsync(customerId, vehicleId, ct);
        var before = (await CurrentProfileAsync(vehicleId, ct))?.DriveScore ?? 100;
        var trip = AddTrip(customerId, vehicle, new TripSummaryUpload(vehicleId, clock.UtcNow.AddMinutes(-20), 8.0, 5.1, 14, 3, 0, 3, 0.92,
            new[] { "tc3n0", "tc3n1", "tc3n4" }), true);
        await db.SaveChangesAsync(ct);
        await RecomputeWeekAsync(vehicleId, ct);
        await db.SaveChangesAsync(ct);
        var created = await EvaluateRulesAsync(vehicle, ct);
        return new ReplayResult(ToDto(trip), before, trip.Score, created);
    }

    public async Task<DriveSenseSummaryDto> GetSummaryAsync(Guid customerId, Guid vehicleId, CancellationToken ct = default)
    {
        var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vehicleId && v.CustomerId == customerId, ct) ?? throw new NotFoundException("Vehicle");
        var history = await db.WearProfiles.AsNoTracking().Where(p => p.VehicleId == vehicleId).OrderByDescending(p => p.WeekStart).Take(12).ToListAsync(ct);
        var current = history.FirstOrDefault();
        var suggestions = await db.Suggestions.AsNoTracking().Where(s => s.VehicleId == vehicleId && s.Status == SuggestionStatus.Open).ToListAsync(ct);
        var points = await db.Loyalty.Where(l => l.CustomerId == customerId && (l.ExpiresAt == null || l.ExpiresAt > clock.UtcNow)).SumAsync(l => (int?)l.Points, ct) ?? 0;
        return new DriveSenseSummaryDto(vehicleId, vehicle.DriveSenseOptIn, current?.DriveScore ?? 100, current?.RoughRoadPct ?? 0, current?.PotholeHits ?? 0,
            history.OrderBy(h => h.WeekStart).Select(h => new WeeklyScoreDto(h.WeekStart, h.DriveScore, h.RoughRoadPct, h.PotholeHits, h.DistanceKm)).ToList(),
            suggestions.Select(ToDto).ToList(), points);
    }

    public async Task<IReadOnlyList<TripDto>> ListTripsAsync(Guid customerId, Guid vehicleId, CancellationToken ct = default)
        => (await db.Trips.AsNoTracking().Where(t => t.CustomerId == customerId && t.VehicleId == vehicleId).OrderByDescending(t => t.StartedAt).Take(50).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<IReadOnlyList<SuggestionDto>> ListSuggestionsAsync(Guid customerId, CancellationToken ct = default)
        => (await db.Suggestions.AsNoTracking().Where(s => s.CustomerId == customerId).OrderByDescending(s => s.CreatedAt).Take(50).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<SuggestionDto> DismissAsync(Guid customerId, Guid suggestionId, CancellationToken ct = default)
    {
        var s = await db.Suggestions.FirstOrDefaultAsync(x => x.Id == suggestionId && x.CustomerId == customerId, ct) ?? throw new NotFoundException("Suggestion");
        if (s.Status != SuggestionStatus.Open) throw new ConflictException("suggestion_closed", "This suggestion is already closed.");
        s.Status = SuggestionStatus.Dismissed;
        s.ClosedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(s);
    }

    /// <summary>One-tap booking from a suggestion (BR-DS-08): goes to the manager like any booking.</summary>
    public async Task<BookingDto> BookAsync(Guid customerId, string customerName, Guid suggestionId, BookSuggestionRequest req, string idempotencyKey, CancellationToken ct = default)
    {
        var s = await db.Suggestions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == suggestionId && x.CustomerId == customerId, ct) ?? throw new NotFoundException("Suggestion");
        if (s.Status != SuggestionStatus.Open) throw new ConflictException("suggestion_closed", "This suggestion is already booked or dismissed.");
        var vehicle = await db.Vehicles.AsNoTracking().FirstAsync(v => v.Id == s.VehicleId, ct);
        return await workshop.RequestBookingAsync(customerId, customerName, vehicle.Label,
            new BookingRequest(vehicle.Id, s.SuggestedServiceId, req.SlotStart, $"DriveSense: {s.Reason}", null, s.Id), idempotencyKey, ct);
    }

    /// <summary>PDPA: removes every trip, wear profile and open suggestion for the customer (BR-DS-16, AC-11).</summary>
    public async Task<int> DeleteAllAsync(Guid customerId, CancellationToken ct = default)
    {
        var trips = await db.Trips.Where(t => t.CustomerId == customerId).ToListAsync(ct);
        var vehicleIds = await db.Vehicles.Where(v => v.CustomerId == customerId).Select(v => v.Id).ToListAsync(ct);
        var profiles = await db.WearProfiles.Where(p => vehicleIds.Contains(p.VehicleId)).ToListAsync(ct);
        var suggestions = await db.Suggestions.Where(s => s.CustomerId == customerId && s.Status == SuggestionStatus.Open).ToListAsync(ct);
        db.Trips.RemoveRange(trips);
        db.WearProfiles.RemoveRange(profiles);
        db.Suggestions.RemoveRange(suggestions);
        foreach (var v in await db.Vehicles.Where(v => v.CustomerId == customerId).ToListAsync(ct)) { v.DriveSenseOptIn = false; v.DriveSenseConsentAt = null; }
        await db.SaveChangesAsync(ct);
        return trips.Count + profiles.Count + suggestions.Count;
    }

    /// <summary>Weekly worker: aggregate every opted-in vehicle, evaluate rules, award points, purge old trips.</summary>
    public async Task RunWeeklyAsync(CancellationToken ct = default)
    {
        var o = options.Value;
        var vehicles = await db.Vehicles.Where(v => v.DriveSenseOptIn && v.Active).ToListAsync(ct);
        foreach (var v in vehicles)
        {
            var profile = await RecomputeWeekAsync(v.Id, ct);
            await db.SaveChangesAsync(ct);
            await EvaluateRulesAsync(v, ct);
            if (profile is { DriveScore: >= 80 } && profile.DistanceKm >= 20)
            {
                var source = $"drivescore:{profile.WeekStart:yyyy-MM-dd}:{v.Id}";
                if (!await db.Loyalty.AnyAsync(l => l.Source == source, ct))
                    db.Loyalty.Add(new LoyaltyEntry
                    {
                        CustomerId = v.CustomerId, Points = profile.DriveScore >= 90 ? o.LoyaltyPointsPerScoreWeek * 2 : o.LoyaltyPointsPerScoreWeek,
                        Source = source, Description = $"Gentle driving week · score {profile.DriveScore}", CreatedAt = clock.UtcNow, ExpiresAt = clock.UtcNow.AddMonths(6),
                    });
            }
        }
        var cutoff = clock.UtcNow.AddDays(-o.TripRetentionDays);
        db.Trips.RemoveRange(await db.Trips.Where(t => t.StartedAt < cutoff).ToListAsync(ct)); // 90-day retention
        await db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------ internals
    private Trip AddTrip(Guid customerId, Vehicle vehicle, TripSummaryUpload t, bool demo)
    {
        Guard.Against(t.DistanceKm is <= 0 or > 2000, "Trip distance is not valid.");
        var trip = new Trip
        {
            CustomerId = customerId, VehicleId = vehicle.Id, StartedAt = t.StartedAt, DistanceKm = t.DistanceKm, RoughKm = Math.Min(t.RoughKm, t.DistanceKm),
            PotholeCount = t.PotholeCount, HarshBrakes = t.HarshBrakes, HarshAccels = t.HarshAccels, SharpCorners = t.SharpCorners,
            Confidence = Math.Clamp(t.Confidence, 0, 1), IsDemoReplay = demo, UploadedAt = clock.UtcNow,
            SegmentGeohashesCsv = string.Join(',', (t.SegmentGeohashes ?? Array.Empty<string>()).Select(g => g.Length > 5 ? g[..5] : g)), // coarse cells only
            Score = DriveSenseRules.TripScore(t.DistanceKm, t.HarshBrakes, t.HarshAccels, t.SharpCorners, t.PotholeCount),
        };
        db.Trips.Add(trip);
        return trip;
    }

    private async Task<Vehicle> OptedInVehicleAsync(Guid customerId, Guid vehicleId, CancellationToken ct)
    {
        var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == vehicleId && x.CustomerId == customerId && x.Active, ct) ?? throw new NotFoundException("Vehicle");
        if (!v.DriveSenseOptIn) throw new AppException(403, "drivesense_off", "Turn on DriveSense for this vehicle first.");
        return v;
    }

    private Task<VehicleWearProfile?> CurrentProfileAsync(Guid vehicleId, CancellationToken ct)
    {
        var week = WeekOf(clock.UtcNow);
        return db.WearProfiles.FirstOrDefaultAsync(p => p.VehicleId == vehicleId && p.WeekStart == week, ct);
    }

    /// <summary>Weekly aggregate; low-confidence trips (pocket on a bike, passenger) are excluded (BR-DS-14).</summary>
    private async Task<VehicleWearProfile?> RecomputeWeekAsync(Guid vehicleId, CancellationToken ct)
    {
        var week = WeekOf(clock.UtcNow);
        var from = week.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var trips = await db.Trips.Where(t => t.VehicleId == vehicleId && t.StartedAt >= from && t.Confidence >= DriveSenseRules.MinConfidence).ToListAsync(ct);
        var profile = await CurrentProfileAsync(vehicleId, ct);
        if (trips.Count == 0) return profile;
        if (profile is null)
        {
            profile = new VehicleWearProfile { VehicleId = vehicleId, WeekStart = week };
            db.WearProfiles.Add(profile);
        }
        var km = trips.Sum(t => t.DistanceKm);
        profile.DistanceKm = Math.Round(km, 1);
        profile.RoughRoadPct = Math.Round(trips.Sum(t => t.RoughKm) / km * 100, 1);
        profile.PotholeHits = trips.Sum(t => t.PotholeCount);
        profile.HarshBrakesPer100Km = Math.Round(trips.Sum(t => t.HarshBrakes) / km * 100, 1);
        profile.HarshAccelsPer100Km = Math.Round(trips.Sum(t => t.HarshAccels) / km * 100, 1);
        profile.DriveScore = (int)Math.Round(trips.Sum(t => t.Score * t.DistanceKm) / km);
        profile.UpdatedAt = clock.UtcNow;
        return profile;
    }

    /// <summary>One open suggestion per component per vehicle; never repeats until booked or dismissed (BR-DS-07).</summary>
    private async Task<IReadOnlyList<SuggestionDto>> EvaluateRulesAsync(Vehicle vehicle, CancellationToken ct)
    {
        var profile = await CurrentProfileAsync(vehicle.Id, ct);
        if (profile is null) return Array.Empty<SuggestionDto>();
        var created = new List<MaintenanceSuggestion>();
        foreach (var rule in DriveSenseRules.Evaluate(profile, vehicle.Type, BrakeServiceId, SuspensionServiceId, DiagnosisServiceId))
        {
            var open = await db.Suggestions.AnyAsync(s => s.VehicleId == vehicle.Id && s.Component == rule.Component && s.Status == SuggestionStatus.Open, ct);
            if (open) continue;
            var s = new MaintenanceSuggestion
            {
                CustomerId = vehicle.CustomerId, VehicleId = vehicle.Id, Component = rule.Component, Reason = rule.Explanation,
                WearFactor = rule.Factor, SuggestedServiceId = rule.ServiceId, CreatedAt = clock.UtcNow,
            };
            db.Suggestions.Add(s);
            created.Add(s);
        }
        await db.SaveChangesAsync(ct);

        foreach (var s in created)
            await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.MaintenanceSuggested, $"{s.Component} check recommended", s.Reason,
                    "suggestion", s.Id, null,
                    new Dictionary<string, string> { ["route"] = "book", ["suggestionId"] = s.Id.ToString(), ["serviceId"] = s.SuggestedServiceId.ToString(), ["vehicleId"] = vehicle.Id.ToString() }),
                new[] { Recipient.User(Roles.Customer, vehicle.CustomerId) }, ct);
        return created.Select(ToDto).ToList();
    }

    public static DateOnly WeekOf(DateTime utc) => DateOnly.FromDateTime(utc.Date.AddDays(-(((int)utc.DayOfWeek + 6) % 7)));

    private static TripDto ToDto(Trip t) => new(t.Id, t.VehicleId, t.StartedAt, t.DistanceKm, t.PotholeCount, t.HarshBrakes, t.HarshAccels, t.SharpCorners, t.Score, t.Confidence, t.Confidence >= DriveSenseRules.MinConfidence);
    private static SuggestionDto ToDto(MaintenanceSuggestion s) => new(s.Id, s.VehicleId, s.Component, s.Reason, s.WearFactor, s.SuggestedServiceId, s.Status.ToString(), s.CreatedAt);
}
