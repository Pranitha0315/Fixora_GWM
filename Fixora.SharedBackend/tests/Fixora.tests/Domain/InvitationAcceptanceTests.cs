using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Domain;

/// <summary>
/// Characterizes Shared <see cref="InvitationService.MarkAcceptedAsync"/>:
/// loads invitation, sets AcceptedAt = clock.UtcNow and MechanicId, saves.
/// No Version field, no already-accepted / expiry / mechanic-directory gates.
/// </summary>
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
        Token = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant(),
        CreatedAt = Now,
        ExpiresAt = Now.AddDays(7)
    };

    private static InvitationService CreateService(ManagerDbContext db, IClock clock)
        => new(db, clock);

    [Fact]
    public async Task Valid_invitation_binds_to_mechanic()
    {
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
        Assert.False(saved.IsValid(Now));
    }

    [Fact]
    public async Task Repeat_binding_overwrites_AcceptedAt_with_clock()
    {
        // Shared MarkAcceptedAsync always assigns clock.UtcNow (no preserve-first-timestamp).
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var mechanicId = Guid.NewGuid();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        clock.UtcNow = Now.AddHours(1);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now.AddHours(1), saved.AcceptedAt);
    }

    [Fact]
    public async Task Shared_allows_rebind_to_another_mechanic()
    {
        // Shared MarkAcceptedAsync has no invitation_already_accepted conflict.
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var originalMechanicId = Guid.NewGuid();
        var otherMechanicId = Guid.NewGuid();
        var clock = new TestClock();

        invitation.AcceptedAt = Now.AddMinutes(-1);
        invitation.MechanicId = originalMechanicId;

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, otherMechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(otherMechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
    }

    [Fact]
    public async Task MarkAccepted_does_not_gate_on_expiry()
    {
        // Validity for lookup is FindValidAsync / IsValid; MarkAcceptedAsync itself does not check ExpiresAt.
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        invitation.ExpiresAt = Now;
        var mechanicId = Guid.NewGuid();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, mechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(mechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
    }

    [Fact]
    public async Task MarkAccepted_does_not_require_mechanic_directory()
    {
        // Shared InvitationService has no IMechanicDirectory — any Guid binds.
        await using var db = CreateDb();
        var invitation = CreateInvitation();
        var unknownMechanicId = Guid.NewGuid();
        var clock = new TestClock();

        db.Invitations.Add(invitation);
        await db.SaveChangesAsync();

        var service = CreateService(db, clock);
        await service.MarkAcceptedAsync(invitation.Id, unknownMechanicId);

        db.ChangeTracker.Clear();
        var saved = await db.Invitations.SingleAsync();

        Assert.Equal(unknownMechanicId, saved.MechanicId);
        Assert.Equal(Now, saved.AcceptedAt);
    }
}
