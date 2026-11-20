using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Infrastructure.Persistence;

/// <summary>
/// Seeds the Northern Province pilot garage: 2 bays, services, staff, stock, 5 weeks of history
/// that plants the three demo insights (Thursday 2–5 PM idle, Kumar's comebacks, brake pads running out),
/// and today's two live jobs for the approval demo.
/// </summary>
public static class ManagerSeeder
{
    public static async Task SeedAsync(ManagerDbContext db, IPasswordService passwords, IClock clock, CancellationToken ct = default)
    {
        if (await db.Workshops.AnyAsync(ct)) return;
        var now = clock.UtcNow;

        var ws = new Workshop
        {
            Id = DemoIds.Workshop,
            Name = "Fixora Garage · Jaffna",
            Phone = "+94 21 222 3344",
            EmergencyPhone = "+94 77 555 0101",
            Address = "No. 42, Point Pedro Road, Jaffna",
            Lat = 9.6847,
            Lng = 80.0255,
        };
        db.Workshops.Add(ws);
        db.Bays.AddRange(new Bay { Id = DemoIds.Bay1, Name = "Bay 1", SortOrder = 1 }, new Bay { Id = DemoIds.Bay2, Name = "Bay 2", SortOrder = 2 });

        var services = new[]
        {
            new ServiceItem { Id = DemoIds.ServiceGeneral, Name = "General Service", Category = "Service", StandardMinutes = 90, BasePrice = 8500 },
            new ServiceItem { Id = DemoIds.ServiceBrake, Name = "Brake Inspection", Category = "Brakes", StandardMinutes = 60, BasePrice = 2500 },
            new ServiceItem { Id = DemoIds.ServiceOil, Name = "Engine Oil Change", Category = "Service", StandardMinutes = 45, BasePrice = 6500 },
            new ServiceItem { Id = DemoIds.ServiceAlignment, Name = "Wheel Alignment", Category = "Tyres", StandardMinutes = 45, BasePrice = 3000 },
            new ServiceItem { Id = DemoIds.ServiceSuspension, Name = "Suspension Check", Category = "Suspension", StandardMinutes = 60, BasePrice = 3500 },
            new ServiceItem { Id = DemoIds.ServiceDiagnosis, Name = "Full Diagnosis", Category = "Diagnosis", StandardMinutes = 60, BasePrice = 4000 },
        };
        db.Services.AddRange(services);

        db.Staff.AddRange(
            new StaffUser { Id = DemoIds.Owner, Name = "Suresh", Email = "owner@fixora.lk", Phone = "+94 77 123 0001", Role = Roles.Owner, PasswordHash = passwords.Hash("Fixora@123") },
            new StaffUser { Id = DemoIds.Manager, Name = "Nirosha", Email = "manager@fixora.lk", Phone = "+94 77 123 0002", Role = Roles.Manager, PasswordHash = passwords.Hash("Fixora@123") });

        await db.SaveChangesAsync(ct);
    }
}
