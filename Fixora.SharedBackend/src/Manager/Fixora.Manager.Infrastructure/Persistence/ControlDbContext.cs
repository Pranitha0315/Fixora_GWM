using Fixora.Manager.Application.Common;
using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Infrastructure.Persistence;

public sealed class ControlDbContext(DbContextOptions<ControlDbContext> options) : DbContext(options), IControlDb
{
    public const string Schema = "control";

    public DbSet<ControlSettings> ControlSettings => Set<ControlSettings>();
    public DbSet<AutoActionLog> AutoActions => Set<AutoActionLog>();

    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        c.Properties<decimal>().HavePrecision(18, 2);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<ControlSettings>().Property(x => x.Mode).HasConversion<string>().HasMaxLength(16);
        b.Entity<AutoActionLog>(e =>
        {
            e.Property(x => x.Kind).HasMaxLength(40);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Detail).HasMaxLength(1000);
            e.HasIndex(x => x.At);
            e.HasIndex(x => new { x.EntityId, x.Kind });
        });
    }
}
