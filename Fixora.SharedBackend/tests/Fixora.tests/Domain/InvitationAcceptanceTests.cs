using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Domain;

public sealed class InvitationAcceptanceTests
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
            .UseInMemoryDatabase($"invitation-acceptance-{Guid.NewGuid():N}")
            .Options;

        return new ManagerDbContext(options);
    }

    private static MechanicInvitation CreateInvitation() => new()
    {
        Name = "Test Mechanic",
        Phone = "0770000000",
        Token = Guid.NewGuid().ToString("N"),
        CreatedAt = Now,
        ExpiresAt = Now.AddDays(7)
    };

    [Fact]
    public async Task Valid_invitation_binds_to_mechanic()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = new InvitationService(db, new TestClock());
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
        Assert.False(saved.IsValid(Now));
    }

    [Fact]
    public async Task Repeat_binding_to_same_mechanic_preserves_timestamp()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = new InvitationService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        clock.UtcNow = Now.AddHours(1);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
    }

    [Fact]
    public async Task Accepted_invitation_cannot_be_rebound()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var originalMechanicId = Guid.NewGuid();

        invitation.AcceptedAt = Now.AddMinutes(-1);
        invitation.MechanicId = originalMechanicId;

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = new InvitationService(db, new TestClock());

        var error = await Assert.ThrowsAsync<ConflictException>(
            () => service.MarkAcceptedAsync(invitation.Id, Guid.NewGuid()));

        Assert.Equal(409, error.Status);
        Assert.Equal("invitation_already_accepted", error.Code);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(originalMechanicId, saved.MechanicId);
        Assert.Equal(Now.AddMinutes(-1), saved.AcceptedAt);
    }

    [Theory]
    [InlineData("Expired")]
    [InlineData("Revoked")]
    public async Task Invalid_invitation_cannot_be_accepted(string state)
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();

        if (state == "Expired")
            invitation.ExpiresAt = Now;
        else
            invitation.RevokedAt = Now.AddMinutes(-1);

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = new InvitationService(db, new TestClock());

        var error = await Assert.ThrowsAsync<AppException>(
            () => service.MarkAcceptedAsync(invitation.Id, Guid.NewGuid()));

        Assert.Equal(410, error.Status);
        Assert.Equal("invite_expired", error.Code);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }

    [Fact]
    public async Task Empty_mechanic_id_cannot_accept_invitation()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = new InvitationService(db, new TestClock());

        await Assert.ThrowsAnyAsync<AppException>(
            () => service.MarkAcceptedAsync(invitation.Id, Guid.Empty));

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }
}
