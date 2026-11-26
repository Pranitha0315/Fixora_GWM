using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Infrastructure.Persistence;

public static class CustomerSeeder
{
    public static async Task SeedAsync(CustomerDbContext db, IPasswordService passwords, IClock clock, CancellationToken ct = default)
    {
        if (await db.Customers.AnyAsync(ct)) return;
        var now = clock.UtcNow;

        db.Customers.AddRange(
            new CustomerAccount { Id = DemoIds.CustomerKavitha, Name = "Kavitha", Email = "kavitha@fixora.lk", Phone = "+94 77 456 7890", EmailVerified = true, PreferredLanguage = "ta", PasswordHash = passwords.Hash("Fixora@123"), CreatedAt = now.AddMonths(-3) },
            new CustomerAccount { Id = DemoIds.CustomerArun, Name = "Arun", Email = "arun@fixora.lk", Phone = "+94 76 222 1100", EmailVerified = true, PreferredLanguage = "en", PasswordHash = passwords.Hash("Fixora@123"), CreatedAt = now.AddMonths(-5) });

        db.Vehicles.AddRange(
            new Vehicle { Id = DemoIds.VehicleWagonR, CustomerId = DemoIds.CustomerKavitha, RegistrationNo = "NP CAB-4521", Make = "Suzuki", Model = "Wagon R", Year = 2018, Type = VehicleType.Car, MileageKm = 64200, Color = "Silver", Fuel = "Petrol", DriveSenseOptIn = true, DriveSenseConsentAt = now.AddDays(-30), CreatedAt = now.AddMonths(-3) },
            new Vehicle { Id = DemoIds.VehicleThreeWheeler, CustomerId = DemoIds.CustomerKavitha, RegistrationNo = "NP QA-7731", Make = "Bajaj", Model = "RE", Year = 2016, Type = VehicleType.ThreeWheeler, MileageKm = 88100, Color = "Green", Fuel = "Petrol", CreatedAt = now.AddMonths(-3) },
            new Vehicle { Id = DemoIds.VehicleArunAxio, CustomerId = DemoIds.CustomerArun, RegistrationNo = "NP KX-2210", Make = "Toyota", Model = "Axio", Year = 2015, Type = VehicleType.Car, MileageKm = 121000, Color = "White", Fuel = "Hybrid", CreatedAt = now.AddMonths(-5) });

        // Previous weeks of DriveSense for the Wagon R: rough-road 62%, score 71 → open suspension suggestion.
        var thisWeek = DriveSenseService.WeekOf(now);
        var scores = new[] { 84, 80, 76, 71 };
        for (var w = 4; w >= 1; w--)
        {
            var week = thisWeek.AddDays(-7 * w);
            db.WearProfiles.Add(new VehicleWearProfile
            {
                VehicleId = DemoIds.VehicleWagonR,
                WeekStart = week,
                DistanceKm = 160 + 10 * w,
                RoughRoadPct = 52 + (4 - w) * 3.4,
                PotholeHits = 18 + (4 - w) * 4,
                DriveScore = scores[4 - w],
                HarshBrakesPer100Km = 4 + (4 - w),
                HarshAccelsPer100Km = 3,
                UpdatedAt = week.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(6),
            });
        }
        db.Suggestions.Add(new MaintenanceSuggestion
        {
            CustomerId = DemoIds.CustomerKavitha,
            VehicleId = DemoIds.VehicleWagonR,
            Component = "Suspension",
            WearFactor = 1.4,
            SuggestedServiceId = DemoIds.ServiceSuspension,
            Reason = "Suspension check recommended — 62% of your driving was on rough roads",
            CreatedAt = now.AddDays(-3),
        });
        SeedHeatmapTrips(db, now);

        db.Loyalty.AddRange(
            new LoyaltyEntry { CustomerId = DemoIds.CustomerKavitha, Points = 200, Source = "drivescore:seed1", Description = "Gentle driving week · score 84", CreatedAt = now.AddDays(-28), ExpiresAt = now.AddMonths(5) },
            new LoyaltyEntry { CustomerId = DemoIds.CustomerKavitha, Points = 100, Source = "drivescore:seed2", Description = "Gentle driving week · score 80", CreatedAt = now.AddDays(-21), ExpiresAt = now.AddMonths(5) },
            new LoyaltyEntry { CustomerId = DemoIds.CustomerKavitha, Points = 45, Source = "spend:INV-DEMO-0007", Description = "Spend on INV-DEMO-0007", CreatedAt = now.AddMonths(-11), ExpiresAt = now.AddDays(24) },
            new LoyaltyEntry { CustomerId = DemoIds.CustomerKavitha, Points = -60, Source = "redeem:INV-DEMO-0007", Description = "Discount on INV-DEMO-0007", CreatedAt = now.AddMonths(-11) },
            new LoyaltyEntry { CustomerId = DemoIds.CustomerKavitha, Points = 120, Source = "drivescore:seed0", Description = "Gentle driving week · score 86", CreatedAt = now.AddMonths(-13), ExpiresAt = now.AddMonths(-7) });

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Demo data for the manager's road-stress heatmap (FX13-D08-NAR-2): three weeks of coarse trip summaries
    /// around Jaffna from Kavitha's Wagon R plus six synthetic pilot-fleet vehicles (IsDemoReplay = true).
    /// Only 5-char geohash cells are stored — never a GPS trace.
    /// </summary>
    private static void SeedHeatmapTrips(CustomerDbContext db, DateTime now)
    {
        var fleet = new[] { DemoIds.VehicleWagonR }
            .Concat(Enumerable.Range(1, 6).Select(i => Guid.Parse($"5f000000-0000-0000-0000-00000000000{i}"))).ToArray();
        // (cell, rough-road share, potholes per 10 km): Point Pedro Rd and Kayts Rd are the rough ones.
        var cells = new (string Hash, double Rough, double Potholes)[]
        {
            ("tc8yv", 0.15, 0.6),  // Jaffna town
            ("tc8zj", 0.25, 1.2),  // Nallur / Kopay
            ("tc8zk", 0.30, 1.5),  // Manipay
            ("tc8zm", 0.35, 1.8),  // Chunnakam
            ("tc8zr", 0.62, 3.4),  // Point Pedro Road
            ("tc8yg", 0.55, 2.6),  // Kayts Road
            ("tc9nb", 0.40, 2.0),  // Chavakachcheri
        };
        var rnd = new Random(808);
        for (var day = 21; day >= 1; day--)
        {
            foreach (var vehicle in fleet)
            {
                if (rnd.Next(3) == 0) continue; // not every vehicle drives every day
                var route = cells.OrderBy(_ => rnd.Next()).Take(rnd.Next(2, 4)).ToList();
                var km = 12 + rnd.Next(0, 25);
                var rough = route.Average(c => c.Rough);
                db.Trips.Add(new Trip
                {
                    CustomerId = vehicle == DemoIds.VehicleWagonR ? DemoIds.CustomerKavitha : Guid.Empty,
                    VehicleId = vehicle,
                    StartedAt = now.AddDays(-day).AddHours(rnd.Next(-3, 4)),
                    DistanceKm = km,
                    RoughKm = Math.Round(km * rough, 1),
                    PotholeCount = (int)Math.Round(km / 10.0 * route.Average(c => c.Potholes)),
                    HarshBrakes = rnd.Next(0, 3),
                    HarshAccels = rnd.Next(0, 2),
                    SharpCorners = rnd.Next(0, 2),
                    Score = 70 + rnd.Next(0, 25),
                    Confidence = 0.9,
                    SegmentGeohashesCsv = string.Join(',', route.Select(c => c.Hash)),
                    IsDemoReplay = true,
                    UploadedAt = now.AddDays(-day),
                });
            }
        }
    }
}
