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

        await db.SaveChangesAsync(ct);
    }
}
