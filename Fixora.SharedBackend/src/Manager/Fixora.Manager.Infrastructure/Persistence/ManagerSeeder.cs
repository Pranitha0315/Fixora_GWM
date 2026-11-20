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
        if (await db.Staff.AnyAsync(ct)) return; // Day 3 checks Workshops instead
        var now = clock.UtcNow;

        db.Staff.AddRange(
            new StaffUser { Id = DemoIds.Owner, Name = "Suresh", Email = "owner@fixora.lk", Phone = "+94 77 123 0001", Role = Roles.Owner, PasswordHash = passwords.Hash("Fixora@123") },
            new StaffUser { Id = DemoIds.Manager, Name = "Nirosha", Email = "manager@fixora.lk", Phone = "+94 77 123 0002", Role = Roles.Manager, PasswordHash = passwords.Hash("Fixora@123") });

        await db.SaveChangesAsync(ct);
    }
}
