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
    public DbSet<InspectionIssue> Issues => Set<InspectionIssue>();
    public DbSet<RepairProposal> Proposals => Set<RepairProposal>();
    public DbSet<RepairItem> RepairItems => Set<RepairItem>();
    public DbSet<ApprovalDecisionRecord> ApprovalDecisions => Set<ApprovalDecisionRecord>();
    public DbSet<ApprovalAuditEntry> ApprovalAudit => Set<ApprovalAuditEntry>();
    public DbSet<CustomerChangeRequest> ChangeRequests => Set<CustomerChangeRequest>();

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

        b.Entity<InspectionIssue>(e =>
        {
            e.Property(x => x.Severity).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(x => x.JobCardId);
            e.Ignore(x => x.MediaRefs);
        });

        b.Entity<RepairProposal>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.HasMany(x => x.Items).WithOne().HasForeignKey(i => i.ProposalId);
            e.HasIndex(x => x.JobCardId);
            e.Ignore(x => x.Total);
            e.Ignore(x => x.ApprovedTotal);
        });

        b.Entity<RepairItem>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.Version).IsConcurrencyToken(); // stale customer decision → 409
            e.Ignore(x => x.Amount);
        });

        b.Entity<ApprovalDecisionRecord>(e =>
        {
            e.Property(x => x.IdempotencyKey).HasMaxLength(100);
            e.HasIndex(x => new { x.RepairItemId, x.IdempotencyKey }).IsUnique();
        });

        b.Entity<ApprovalAuditEntry>().HasIndex(x => x.ProposalId);

        b.Entity<CustomerChangeRequest>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            e.Ignore(x => x.Changes);
        });

        b.UseClientGeneratedGuids();
    }
}
