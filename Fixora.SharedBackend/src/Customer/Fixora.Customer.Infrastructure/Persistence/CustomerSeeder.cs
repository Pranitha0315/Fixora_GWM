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

        await db.SaveChangesAsync(ct);
    }
}
