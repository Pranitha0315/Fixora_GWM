using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Shared.Infrastructure.Persistence;

/// <summary>Cross-cutting tables only: notifications, device tokens, refresh tokens (schema "shared").</summary>
public sealed class SharedDbContext(DbContextOptions<SharedDbContext> options) : DbContext(options)
{
    public const string Schema = "shared";

    public DbSet<RefreshTokenRecord> RefreshTokens => Set<RefreshTokenRecord>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<RefreshTokenRecord>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.Property(x => x.TokenHash).HasMaxLength(128);
            e.Property(x => x.Role).HasMaxLength(32);
            e.Property(x => x.Name).HasMaxLength(200);
        });

        b.UseClientGeneratedGuids();
    }
}

public sealed class RefreshTokenRecord : Entity
{
    public Guid UserId { get; set; }
    public string Role { get; set; } = "";
    public string Name { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
