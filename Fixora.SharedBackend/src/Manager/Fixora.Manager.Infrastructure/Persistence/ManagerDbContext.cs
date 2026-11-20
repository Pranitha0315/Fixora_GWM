using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Infrastructure.Persistence;

/// <summary>Canonical workshop records (schema "workshop"): appointments, jobs, approvals, invoices, stock, advisor.</summary>
public sealed class ManagerDbContext(DbContextOptions<ManagerDbContext> options) : DbContext(options), IManagerDb
{
    public const string Schema = "workshop";

    public DbSet<Workshop> Workshops => Set<Workshop>();
    public DbSet<Bay> Bays => Set<Bay>();
    public DbSet<ServiceItem> Services => Set<ServiceItem>();
    public DbSet<StaffUser> Staff => Set<StaffUser>();
    public DbSet<MechanicInvitation> Invitations => Set<MechanicInvitation>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<JobCard> JobCards => Set<JobCard>();
    public DbSet<ProgressUpdate> ProgressUpdates => Set<ProgressUpdate>();

    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        c.Properties<decimal>().HavePrecision(18, 2);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);

        b.Entity<Workshop>().Property(x => x.Name).HasMaxLength(200);
        b.Entity<StaffUser>(e => { e.HasIndex(x => x.Email).IsUnique(); e.Property(x => x.Email).HasMaxLength(256); e.Property(x => x.Role).HasMaxLength(32); });
        b.Entity<MechanicInvitation>(e => { e.HasIndex(x => x.Token).IsUnique(); e.Property(x => x.Token).HasMaxLength(32); });

        b.Entity<Appointment>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Source).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.IdempotencyKey).HasMaxLength(100);
            e.Property(x => x.PromoCode).HasMaxLength(32);
            e.HasIndex(x => new { x.CustomerId, x.IdempotencyKey });
            e.HasIndex(x => x.SlotStart);
        });

        b.Entity<JobCard>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Number).HasMaxLength(32);
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => x.CustomerId);
            e.HasIndex(x => x.MechanicId);
            e.Ignore(x => x.IsActive);
        });

        b.UseClientGeneratedGuids();
    }
}
