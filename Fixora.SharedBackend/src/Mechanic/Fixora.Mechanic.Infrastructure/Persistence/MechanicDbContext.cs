using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Mechanic.Infrastructure.Persistence;

public sealed class MechanicDbContext(DbContextOptions<MechanicDbContext> options) : DbContext(options), IMechanicDb
{
    public const string Schema = "mechanic";

    public DbSet<MechanicAccount> Mechanics => Set<MechanicAccount>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<MechanicAccount>(e =>
        {
            e.HasIndex(x => x.EmployeeCode).IsUnique();
            e.HasIndex(x => x.Phone);
            e.Property(x => x.EmployeeCode).HasMaxLength(16);
            e.Property(x => x.Phone).HasMaxLength(32);
        });
        b.UseClientGeneratedGuids();
    }
}

public static class MechanicSeeder
{
    public static async Task SeedAsync(MechanicDbContext db, IPasswordService passwords, CancellationToken ct = default)
    {
        if (await db.Mechanics.AnyAsync(ct)) return;
        db.Mechanics.AddRange(
            new MechanicAccount { Id = DemoIds.MechanicRavi, Name = "Ravi", Phone = "0771234567", EmployeeCode = "EMP-001", PinHash = passwords.Hash("1234") },
            new MechanicAccount { Id = DemoIds.MechanicKumar, Name = "Kumar", Phone = "0772345678", EmployeeCode = "EMP-002", PinHash = passwords.Hash("2345") },
            new MechanicAccount { Id = DemoIds.MechanicSenthil, Name = "Senthil", Phone = "0773456789", EmployeeCode = "EMP-003", PinHash = passwords.Hash("3456"), OnDuty = false });
        await db.SaveChangesAsync(ct);
    }
}
