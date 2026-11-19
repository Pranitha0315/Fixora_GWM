using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Fixora.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Domain;

public sealed class InvitationRevocationTests
{
    private static ManagerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<ManagerDbContext>()
            .UseInMemoryDatabase($"invitation-revocation-{Guid.NewGuid():N}")
            .Options;

        return new ManagerDbContext(options);
    }

    private static InvitationService CreateService(ManagerDbContext db)
        => new(db, new SystemClock(), new TestMechanicDirectory());

    private static MechanicInvitation CreateInvitation() => new()
    {
        Name = "Test Mechanic",
        Phone = "0770000000",
        Token = Guid.NewGuid().ToString("N"),
        CreatedAt = DateTime.UtcNow,
        ExpiresAt = DateTime.UtcNow.AddDays(7)
    };

    [Fact]
    public async Task Pending_invitation_can_be_revoked()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db);
        await service.RevokeAsync(invitation.Id);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.NotNull(saved.RevokedAt);
        Assert.Null(saved.AcceptedAt);
        Assert.False(saved.IsValid(DateTime.UtcNow));
    }

    [Fact]
    public async Task Accepted_invitation_cannot_be_revoked()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        invitation.AcceptedAt = DateTime.UtcNow;
        invitation.MechanicId = Guid.NewGuid();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db);

        var error = await Assert.ThrowsAsync<ConflictException>(
            () => service.RevokeAsync(invitation.Id));

        Assert.Equal(409, error.Status);
        Assert.Equal("invitation_already_accepted", error.Code);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.RevokedAt);
        Assert.NotNull(saved.AcceptedAt);
    }

    [Fact]
    public async Task Repeated_revocation_preserves_original_timestamp()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var originalRevokedAt = DateTime.UtcNow.AddHours(-1);
        invitation.RevokedAt = originalRevokedAt;

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db);

        await service.RevokeAsync(invitation.Id);
        await service.RevokeAsync(invitation.Id);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(originalRevokedAt, saved.RevokedAt);
    }
}
