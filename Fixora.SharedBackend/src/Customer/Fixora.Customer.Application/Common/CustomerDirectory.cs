using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Contracts;
using Fixora.Customer.Domain;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fixora.Customer.Application.Common;

public sealed record LoyaltyEntryDto(int Points, string Source, string Description, DateTime CreatedAt, DateTime? ExpiresAt);
public sealed record LoyaltyDto(int Balance, IReadOnlyList<LoyaltyEntryDto> History, decimal RupeesPerPoint);

/// <summary>Read-only customer facts for the Manager and Mechanic contexts, plus loyalty ledger operations.</summary>
public sealed class CustomerDirectory(ICustomerDb db, IOptions<CustomerOptions> options, IClock clock) : ICustomerDirectory
{
    public async Task<CustomerSummary?> GetCustomerAsync(Guid customerId, CancellationToken ct = default)
        => await db.Customers.AsNoTracking().Where(c => c.Id == customerId)
            .Select(c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage)).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, CustomerSummary>> GetCustomersAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var list = ids.Distinct().ToList();
        return await db.Customers.AsNoTracking().Where(c => list.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage), ct);
    }

    public async Task<VehicleSummary?> GetVehicleAsync(Guid vehicleId, CancellationToken ct = default)
    {
        var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        return v is null ? null : new VehicleSummary(v.Id, v.CustomerId, v.RegistrationNo, v.Make, v.Model, v.Year, v.Type.ToString(), v.DriveSenseOptIn);
    }

    public async Task<DriveSenseHintDto?> GetDriveSenseHintAsync(Guid vehicleId, CancellationToken ct = default)
    {
        var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        if (v is null || !v.DriveSenseOptIn) return null; // consent: no hint for opted-out vehicles
        var p = await db.WearProfiles.AsNoTracking().Where(x => x.VehicleId == vehicleId).OrderByDescending(x => x.WeekStart).FirstOrDefaultAsync(ct);
        if (p is null) return null;
        var flags = new List<string>();
        if (p.HarshBrakesPer100Km >= 8) flags.Add("Harsh braking");
        if (p.PotholeHits >= 10) flags.Add("Pothole hits");
        if (p.RoughRoadPct >= 60) flags.Add("Rough roads");
        if (p.HarshAccelsPer100Km >= 10) flags.Add("Hard acceleration");
        return new DriveSenseHintDto(vehicleId, p.RoughRoadPct, p.DriveScore, p.PotholeHits, flags.Take(3).ToList(), p.WeekStart);
    }

    public async Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(CancellationToken ct = default)
        => await db.Customers.AsNoTracking().Where(c => c.EmailVerified).OrderBy(c => c.Name)
            .Select(c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage)).ToListAsync(ct);

    public async Task MarkSuggestionBookedAsync(Guid suggestionId, Guid appointmentId, CancellationToken ct = default)
    {
        var s = await db.Suggestions.FirstOrDefaultAsync(x => x.Id == suggestionId, ct);
        if (s is null || s.Status != SuggestionStatus.Open) return;
        s.Status = SuggestionStatus.Booked;
        s.AppointmentId = appointmentId;
        s.ClosedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Garage-only points become an automatic invoice discount line, capped by the owner's % and rupee cap.</summary>
    public async Task<LoyaltyRedemption> RedeemForInvoiceAsync(Guid customerId, decimal invoiceSubtotal, decimal percent, decimal cap, string invoiceNumber, CancellationToken ct = default)
    {
        var balance = await BalanceAsync(customerId, ct);
        if (balance <= 0 || percent <= 0) return new LoyaltyRedemption(0, 0);
        var maxDiscount = Math.Min(cap, Math.Round(invoiceSubtotal * percent / 100m, 0));
        var points = (int)Math.Min(balance, Math.Floor(maxDiscount / options.Value.RupeesPerPoint));
        if (points <= 0) return new LoyaltyRedemption(0, 0);
        db.Loyalty.Add(new LoyaltyEntry { CustomerId = customerId, Points = -points, Source = $"redeem:{invoiceNumber}", Description = $"Discount on {invoiceNumber}", CreatedAt = clock.UtcNow });
        await db.SaveChangesAsync(ct);
        return new LoyaltyRedemption(points * options.Value.RupeesPerPoint, points);
    }

    public async Task AwardSpendPointsAsync(Guid customerId, decimal paidAmount, string invoiceNumber, CancellationToken ct = default)
    {
        var points = (int)Math.Floor(paidAmount / 100m); // 1 point per Rs 100 spent
        if (points <= 0 || await db.Loyalty.AnyAsync(l => l.Source == $"spend:{invoiceNumber}", ct)) return;
        db.Loyalty.Add(new LoyaltyEntry { CustomerId = customerId, Points = points, Source = $"spend:{invoiceNumber}", Description = $"Spend on {invoiceNumber}", CreatedAt = clock.UtcNow, ExpiresAt = clock.UtcNow.AddMonths(12) });
        await db.SaveChangesAsync(ct);
    }

    public async Task<LoyaltyDto> GetLoyaltyAsync(Guid customerId, CancellationToken ct = default)
    {
        var rows = await db.Loyalty.AsNoTracking().Where(l => l.CustomerId == customerId).OrderByDescending(l => l.CreatedAt).Take(100).ToListAsync(ct);
        return new LoyaltyDto(await BalanceAsync(customerId, ct), rows.Select(l => new LoyaltyEntryDto(l.Points, l.Source, l.Description, l.CreatedAt, l.ExpiresAt)).ToList(), options.Value.RupeesPerPoint);
    }

    private async Task<int> BalanceAsync(Guid customerId, CancellationToken ct)
        => await db.Loyalty.Where(l => l.CustomerId == customerId && (l.ExpiresAt == null || l.ExpiresAt > clock.UtcNow)).SumAsync(l => (int?)l.Points, ct) ?? 0;

    /// <summary>
    /// Road-stress heatmap (FX13-D08). Trips carry only 5-char geohash cells (no GPS trace). Each trip's distance,
    /// rough km and potholes are shared equally across the cells it passed; a cell is returned only when
    /// at least HeatmapMinVehicles different vehicles drove there, so no single driver's route can be seen.
    /// </summary>
    public async Task<IReadOnlyList<RoadStressCellDto>> GetRoadStressAsync(int days, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 1, Math.Max(1, options.Value.TripRetentionDays));
        var minVehicles = Math.Max(1, options.Value.HeatmapMinVehicles);
        var since = clock.UtcNow.AddDays(-days);
        var trips = await db.Trips.AsNoTracking()
            .Where(t => t.StartedAt >= since && t.SegmentGeohashesCsv != "" && t.Confidence >= 0.6)
            .Select(t => new { t.VehicleId, t.DistanceKm, t.RoughKm, t.PotholeCount, t.SegmentGeohashesCsv })
            .ToListAsync(ct);

        var cells = new Dictionary<string, (HashSet<Guid> Vehicles, int Trips, double Km, double RoughKm, double Potholes)>();
        foreach (var t in trips)
        {
            var hashes = t.SegmentGeohashesCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(h => h.Length > 5 ? h[..5] : h).Distinct().ToList();
            if (hashes.Count == 0) continue;
            var share = 1.0 / hashes.Count;
            foreach (var h in hashes)
            {
                if (!cells.TryGetValue(h, out var c)) c = (new HashSet<Guid>(), 0, 0, 0, 0);
                c.Vehicles.Add(t.VehicleId);
                cells[h] = (c.Vehicles, c.Trips + 1, c.Km + t.DistanceKm * share, c.RoughKm + t.RoughKm * share, c.Potholes + t.PotholeCount * share);
            }
        }

        var result = new List<RoadStressCellDto>();
        foreach (var (hash, c) in cells)
        {
            if (c.Vehicles.Count < minVehicles || c.Km <= 0) continue;
            if (Geohash.Centre(hash) is not { } centre) continue;
            var roughPct = Math.Round(100 * c.RoughKm / c.Km, 1);
            var potholesPer100 = Math.Round(100 * c.Potholes / c.Km, 1);
            var level = roughPct >= 50 || potholesPer100 >= 20 ? "high" : roughPct >= 25 || potholesPer100 >= 10 ? "medium" : "low";
            result.Add(new RoadStressCellDto(hash, Math.Round(centre.Lat, 4), Math.Round(centre.Lng, 4), c.Vehicles.Count, c.Trips, roughPct, potholesPer100, level));
        }
        return result.OrderByDescending(r => r.RoughRoadPct).ToList();
    }
}
