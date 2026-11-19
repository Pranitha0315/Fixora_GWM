using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Contracts;
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

    private sealed class StubMechanicDirectory(params Guid[] activeIds) : IMechanicDirectory
    {
        private readonly HashSet<Guid> _active = activeIds.ToHashSet();
        private readonly HashSet<Guid> _inactive = new();

        public StubMechanicDirectory WithInactive(Guid id)
        {
            _inactive.Add(id);
            return this;
        }

        public Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default)
        {
            if (_active.Contains(mechanicId))
                return Task.FromResult<MechanicSummary?>(
                    new MechanicSummary(mechanicId, "Active", "0770000001", "EMP-100", true, true));

            if (_inactive.Contains(mechanicId))
                return Task.FromResult<MechanicSummary?>(
                    new MechanicSummary(mechanicId, "Inactive", "0770000002", "EMP-101", false, false));

            return Task.FromResult<MechanicSummary?>(null);
        }

        public Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default)
            => Task.FromResult<IReadOnlyList<MechanicSummary>>(Array.Empty<MechanicSummary>());
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
        Token = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant(),
        CreatedAt = Now,
        ExpiresAt = Now.AddDays(7)
    };

    private static InvitationService CreateService(
        ManagerDbContext db,
        IClock clock,
        params Guid[] knownMechanicIds)
        => new(db, clock, new StubMechanicDirectory(knownMechanicIds));

    [Fact]
    public async Task Valid_invitation_binds_to_mechanic()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, new TestClock(), mechanicId);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
        Assert.Equal(1, saved.Version);
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

        var service = CreateService(db, clock, mechanicId);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        clock.UtcNow = Now.AddHours(1);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
        Assert.Equal(1, saved.Version);
    }

    [Fact]
    public async Task Accepted_invitation_cannot_be_rebound()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var originalMechanicId = Guid.NewGuid();
        var otherMechanicId = Guid.NewGuid();

        invitation.AcceptedAt = Now.AddMinutes(-1);
        invitation.MechanicId = originalMechanicId;
        invitation.Version = 1;

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, new TestClock(), originalMechanicId, otherMechanicId);

        var error = await Assert.ThrowsAsync<ConflictException>(
            () => service.MarkAcceptedAsync(invitation.Id, otherMechanicId));

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
        var mechanicId = Guid.NewGuid();

        if (state == "Expired")
            invitation.ExpiresAt = Now;
        else
            invitation.RevokedAt = Now.AddMinutes(-1);

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, new TestClock(), mechanicId);

        var error = await Assert.ThrowsAsync<AppException>(
            () => service.MarkAcceptedAsync(invitation.Id, mechanicId));

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

        var service = CreateService(db, new TestClock());

        await Assert.ThrowsAnyAsync<AppException>(
            () => service.MarkAcceptedAsync(invitation.Id, Guid.Empty));

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }

    [Fact]
    public async Task Missing_mechanic_account_cannot_accept_invitation()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, new TestClock());

        var error = await Assert.ThrowsAsync<NotFoundException>(
            () => service.MarkAcceptedAsync(invitation.Id, Guid.NewGuid()));

        Assert.Equal(404, error.Status);
        Assert.Equal("not_found", error.Code);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }

    [Fact]
    public async Task Inactive_mechanic_account_cannot_accept_invitation()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var directory = new StubMechanicDirectory().WithInactive(mechanicId);
        var service = new InvitationService(db, new TestClock(), directory);

        var error = await Assert.ThrowsAsync<ConflictException>(
            () => service.MarkAcceptedAsync(invitation.Id, mechanicId));

        Assert.Equal("mechanic_inactive", error.Code);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }
}
