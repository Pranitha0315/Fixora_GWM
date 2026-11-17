using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Domain;

public sealed class InvitationValidationTests
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
            .UseInMemoryDatabase($"invitation-validation-{Guid.NewGuid():N}")
            .Options;

        return new ManagerDbContext(options);
    }

    [Fact]
    public async Task Created_invitation_expires_after_exactly_seven_days()
    {
        await using var db = CreateDb();
        var clock = new TestClock();
        var service = new InvitationService(db, clock);
        var staffId = Guid.NewGuid();

        var result = await service.CreateAsync(
            staffId,
            new CreateInvitationRequest("Test Mechanic", "0770000000"));

        var saved = await db.Invitations.AsNoTracking().SingleAsync();

        Assert.Equal(Now, saved.CreatedAt);
        Assert.Equal(Now.AddDays(7), saved.ExpiresAt);
        Assert.Equal(staffId, saved.CreatedBy);
        Assert.Equal("Pending", result.Status);

        var valid = await service.FindValidAsync(result.Token);

        Assert.NotNull(valid);
        Assert.Equal(saved.Id, valid!.Id);
    }

    [Fact]
    public async Task Invitation_is_valid_just_before_expiry()
    {
        await using var db = CreateDb();
        var clock = new TestClock();
        var service = new InvitationService(db, clock);

        var result = await service.CreateAsync(
            Guid.NewGuid(),
            new CreateInvitationRequest("Test Mechanic", "0770000000"));

        clock.UtcNow = result.ExpiresAt.AddTicks(-1);

        Assert.NotNull(await service.FindValidAsync(result.Token));
    }

    [Fact]
    public async Task Invitation_is_invalid_at_and_after_expiry()
    {
        await using var db = CreateDb();
        var clock = new TestClock();
        var service = new InvitationService(db, clock);

        var result = await service.CreateAsync(
            Guid.NewGuid(),
            new CreateInvitationRequest("Test Mechanic", "0770000000"));

        clock.UtcNow = result.ExpiresAt;
        Assert.Null(await service.FindValidAsync(result.Token));

        clock.UtcNow = result.ExpiresAt.AddSeconds(1);
        Assert.Null(await service.FindValidAsync(result.Token));
    }

    [Fact]
    public async Task Revoked_invitation_cannot_be_found_as_valid()
    {
        await using var db = CreateDb();
        var clock = new TestClock();
        var service = new InvitationService(db, clock);

        var result = await service.CreateAsync(
            Guid.NewGuid(),
            new CreateInvitationRequest("Test Mechanic", "0770000000"));

        await service.RevokeAsync(result.Id);

        Assert.Null(await service.FindValidAsync(result.Token));
    }

    [Fact]
    public async Task Accepted_invitation_cannot_be_found_as_valid()
    {
        await using var db = CreateDb();
        var clock = new TestClock();
        var service = new InvitationService(db, clock);

        var result = await service.CreateAsync(
            Guid.NewGuid(),
            new CreateInvitationRequest("Test Mechanic", "0770000000"));

        await service.MarkAcceptedAsync(result.Id, Guid.NewGuid());

        Assert.Null(await service.FindValidAsync(result.Token));
    }
}
