using Fixora.Customer.Application.Common;
using Fixora.Customer.Domain;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Infrastructure.Persistence;

public sealed class CustomerDbContext(DbContextOptions<CustomerDbContext> options) : DbContext(options), ICustomerDb
{
    public const string Schema = "customer";

    public DbSet<CustomerAccount> Customers => Set<CustomerAccount>();
    public DbSet<EmailOtpChallenge> OtpChallenges => Set<EmailOtpChallenge>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<SosRequest> SosRequests => Set<SosRequest>();
    public DbSet<SosStatusHistory> SosHistory => Set<SosStatusHistory>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<VehicleWearProfile> WearProfiles => Set<VehicleWearProfile>();
    public DbSet<MaintenanceSuggestion> Suggestions => Set<MaintenanceSuggestion>();
    public DbSet<LoyaltyEntry> Loyalty => Set<LoyaltyEntry>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<CustomerAccount>(e =>
        {
            e.ToTable("Customers");
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Phone).HasMaxLength(32);
            e.Property(x => x.PreferredLanguage).HasMaxLength(5);
        });
        b.Entity<EmailOtpChallenge>(e => { e.HasIndex(x => new { x.Email, x.Purpose }); e.Property(x => x.Email).HasMaxLength(256); });
        b.Entity<Vehicle>(e =>
        {
            e.HasIndex(x => x.CustomerId);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.RegistrationNo).HasMaxLength(20);
            e.Ignore(x => x.Label);
        });
        b.Entity<SosRequest>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.IdempotencyKey).HasMaxLength(100);
            e.HasIndex(x => new { x.CustomerId, x.IdempotencyKey }).IsUnique(); // duplicate SOS → one row (AC-03)
            e.HasMany(x => x.History).WithOne().HasForeignKey(h => h.SosRequestId);
            e.Ignore(x => x.IsOpen);
        });
        b.Entity<SosStatusHistory>().Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        b.Entity<Trip>().HasIndex(x => new { x.VehicleId, x.StartedAt });
        b.Entity<VehicleWearProfile>().HasIndex(x => new { x.VehicleId, x.WeekStart }).IsUnique();
        b.Entity<MaintenanceSuggestion>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(12);
            e.HasIndex(x => new { x.VehicleId, x.Component, x.Status });
        });
        b.Entity<LoyaltyEntry>().HasIndex(x => x.CustomerId);

        b.UseClientGeneratedGuids();
    }
}
