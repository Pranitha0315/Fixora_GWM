using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Domain;

/// <summary>
/// Characterizes Shared <see cref="InvitationService.RevokeAsync"/>:
/// loads invitation, sets <c>RevokedAt = clock.UtcNow</c>, saves — no accepted-state gate,
/// no idempotent timestamp preserve.
/// </summary>
public sealed class InvitationRevocationTests
{
    private static readonly DateTime Now =
        new(2026, 11, 17, 10, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"invitation-revocation-{Guid.NewGuid():N}")
            .Options;

        return new ManagerDbContext(options);
    }

    private static InvitationService CreateService(ManagerDbContext db, IClock clock)
        => new(db, clock);

    private static MechanicInvitation CreateInvitation() => new()
    {
        Name = "Test Mechanic",
        Phone = "0770000000",
        Token = Guid.NewGuid().ToString("N"),
        CreatedAt = Now,
        ExpiresAt = Now.AddDays(7)
    };

    [Fact]
    public async Task Pending_invitation_can_be_revoked()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.RevokeAsync(invitation.Id);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(Now, saved.RevokedAt);
        Assert.Null(saved.AcceptedAt);
        Assert.False(saved.IsValid(Now));
    }

    [Fact]
    public async Task Accepted_invitation_can_still_be_revoked_on_Shared()
    {
        // Shared RevokeAsync does not check AcceptedAt; it always stamps RevokedAt.
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        invitation.AcceptedAt = Now.AddMinutes(-5);
        invitation.MechanicId = Guid.NewGuid();
        var clock = new TestClock { UtcNow = Now };

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.RevokeAsync(invitation.Id);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(Now, saved.RevokedAt);
        Assert.NotNull(saved.AcceptedAt);
    }

    [Fact]
    public async Task Repeated_revocation_overwrites_RevokedAt_with_clock()
    {
        // Shared RevokeAsync always assigns clock.UtcNow (no preserve-original path).
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        invitation.RevokedAt = Now.AddHours(-1);
        var clock = new TestClock { UtcNow = Now };

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.RevokeAsync(invitation.Id);

        clock.UtcNow = Now.AddMinutes(30);
        await service.RevokeAsync(invitation.Id);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(Now.AddMinutes(30), saved.RevokedAt);
    }
}
