using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Shared.Infrastructure.Persistence;

/// <summary>Cross-cutting tables only: notifications, device tokens, refresh tokens (schema "shared").</summary>
public sealed class SharedDbContext(DbContextOptions<SharedDbContext> options) : DbContext(options)
{
    public const string Schema = "shared";

    public DbSet<NotificationRecord> Notifications => Set<NotificationRecord>();
    public DbSet<DeviceToken> DeviceTokens => Set<DeviceToken>();
    public DbSet<RefreshTokenRecord> RefreshTokens => Set<RefreshTokenRecord>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<NotificationRecord>(e =>
        {
            e.HasIndex(x => new { x.RecipientId, x.CreatedAt });
            e.HasIndex(x => new { x.RecipientRole, x.CreatedAt });
            e.Property(x => x.Type).HasMaxLength(64);
            e.Property(x => x.RecipientRole).HasMaxLength(32);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Body).HasMaxLength(1000);
            e.Property(x => x.EntityType).HasMaxLength(64);
        });
        b.Entity<DeviceToken>(e =>
        {
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Token).HasMaxLength(512);
            e.Property(x => x.Role).HasMaxLength(32);
            e.Property(x => x.Platform).HasMaxLength(32);
        });
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

public sealed class NotificationRecord : Entity
{
    public string RecipientRole { get; set; } = "";
    public Guid? RecipientId { get; set; }
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? EntityType { get; set; }
    public Guid? EntityId { get; set; }
    public Guid? JobId { get; set; }
    public string? DataJson { get; set; }
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class DeviceToken : Entity
{
    public Guid UserId { get; set; }
    public string Role { get; set; } = "";
    public string Token { get; set; } = "";
    public string Platform { get; set; } = "android";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
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
