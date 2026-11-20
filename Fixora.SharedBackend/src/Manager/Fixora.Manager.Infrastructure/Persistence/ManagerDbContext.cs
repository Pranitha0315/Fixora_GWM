using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Infrastructure.Persistence;

/// <summary>Canonical workshop records (schema "workshop"): appointments, jobs, approvals, invoices, stock, advisor.</summary>
public sealed class ManagerDbContext(DbContextOptions<ManagerDbContext> options) : DbContext(options), IManagerDb
{
    public const string Schema = "workshop";

    public DbSet<StaffUser> Staff => Set<StaffUser>();
    public DbSet<MechanicInvitation> Invitations => Set<MechanicInvitation>();

    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        c.Properties<decimal>().HavePrecision(18, 2);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);

        b.Entity<StaffUser>(e => { e.HasIndex(x => x.Email).IsUnique(); e.Property(x => x.Email).HasMaxLength(256); e.Property(x => x.Role).HasMaxLength(32); });
        b.Entity<MechanicInvitation>(e => { e.HasIndex(x => x.Token).IsUnique(); e.Property(x => x.Token).HasMaxLength(32); });

        b.UseClientGeneratedGuids();
    }
}
