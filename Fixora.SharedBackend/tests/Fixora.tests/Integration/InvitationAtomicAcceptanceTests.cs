using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Application.Auth;
using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Contracts;
using Fixora.Mechanic.Domain;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Fixora.Tests.Integration;

/// <summary>
/// LocalDB coverage for atomic invitation acceptance and concurrency.
/// </summary>
public sealed class InvitationAtomicAcceptanceFixture : IAsyncLifetime
{
    public string DatabaseName { get; } =
        $"FixoraInvite_{Guid.NewGuid():N}";

    public string ConnectionString =>
        $"Server=(localdb)\\MSSQLLocalDB;Database={DatabaseName};Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true";

    public async Task InitializeAsync()
    {
        await using var manager = CreateManager();
        await using var mechanic = CreateMechanic();

        await manager.EnsureSchemaAsync(ManagerDbContext.Schema);
        await mechanic.EnsureSchemaAsync(MechanicDbContext.Schema);
    }

    public async Task DisposeAsync()
    {
        await using var conn = new SqlConnection(
            "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True");

        await conn.OpenAsync();

        await using var cmd = conn.CreateCommand();

        cmd.CommandText = $"""
            IF DB_ID(N'{DatabaseName}') IS NOT NULL
            BEGIN
                ALTER DATABASE [{DatabaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE [{DatabaseName}];
            END
            """;

        await cmd.ExecuteNonQueryAsync();
    }

    public ManagerDbContext CreateManager()
        => new(new DbContextOptionsBuilder<ManagerDbContext>()
            .UseSqlServer(ConnectionString)
            .Options);

    public MechanicDbContext CreateMechanic()
        => new(new DbContextOptionsBuilder<MechanicDbContext>()
            .UseSqlServer(ConnectionString)
            .Options);
}

[CollectionDefinition("localdb-invite", DisableParallelization = true)]
public sealed class LocalDbInviteCollection
    : ICollectionFixture<InvitationAtomicAcceptanceFixture>;

[Collection("localdb-invite")]
public sealed class InvitationAtomicAcceptanceTests(
    InvitationAtomicAcceptanceFixture fixture)
{
    private static readonly DateTime Now =
        new(2026, 11, 17, 10, 0, 0, DateTimeKind.Utc);

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = Now;
    }

    private sealed class StubPasswords : IPasswordService
    {
        public string Hash(string secret) => $"hash:{secret}";

        public bool Verify(string hash, string secret)
            => hash == $"hash:{secret}";
    }

    private sealed class StubTokens : ITokenService
    {
        public Task<AuthTokens> IssueAsync(
            Guid userId,
            string role,
            string name,
            CancellationToken ct = default)
            => Task.FromResult(new AuthTokens(
                "access",
                Now.AddHours(1),
                "refresh",
                Now.AddDays(1),
                userId,
                role,
                name));

        public Task<AuthTokens> RefreshAsync(
            string refreshToken,
            CancellationToken ct = default)
            => throw new NotSupportedException();

        public Task RevokeAsync(
            string refreshToken,
            CancellationToken ct = default)
            => throw new NotSupportedException();
    }

    private sealed class RealMechanicDirectory(IMechanicDb db)
        : IMechanicDirectory
    {
        public async Task<MechanicSummary?> GetAsync(
            Guid mechanicId,
            CancellationToken ct = default)
            => await db.Mechanics
                .AsNoTracking()
                .Where(m => m.Id == mechanicId)
                .Select(m => new MechanicSummary(
                    m.Id,
                    m.Name,
                    m.Phone,
                    m.EmployeeCode,
                    m.Active,
                    m.OnDuty))
                .FirstOrDefaultAsync(ct);

        public Task<IReadOnlyList<MechanicSummary>> ListAsync(
            CancellationToken ct = default)
            => throw new NotSupportedException();
    }

    private static MechanicInvitation NewInvitation() => new()
    {
        Name = "Atomic Mechanic",
        Phone = "0771111222",
        Token = Guid.NewGuid().ToString("N")[..10].ToUpperInvariant(),
        CreatedAt = Now,
        ExpiresAt = Now.AddDays(7),
        CreatedBy = Guid.NewGuid()
    };

    [Fact]
    public async Task Accept_invitation_creates_account_and_binds_atomically()
    {
        await using var manager = fixture.CreateManager();
        await using var mechanic = fixture.CreateMechanic();

        var invitation = NewInvitation();
        manager.Invitations.Add(invitation);
        await manager.SaveChangesAsync();

        var auth = CreateAuth(manager, mechanic);

        var tokens = await auth.AcceptInvitationAsync(
            new AcceptInvitationRequest(
                invitation.Token, "Nidhu", "1234"));

        manager.ChangeTracker.Clear();
        mechanic.ChangeTracker.Clear();

        var savedInvite = await manager.Invitations
            .SingleAsync(i => i.Id == invitation.Id);

        var savedMechanic = await mechanic.Mechanics
            .SingleAsync(m => m.Id == tokens.UserId);

        Assert.Equal(tokens.UserId, savedInvite.MechanicId);
        Assert.Equal(Now, savedInvite.AcceptedAt);
        Assert.Equal(1, savedInvite.Version);
        Assert.Equal(invitation.Id, savedMechanic.InvitationId);
        Assert.Equal("Nidhu", savedMechanic.Name);
    }

    [Fact]
    public async Task Failed_bind_rolls_back_new_mechanic_account()
    {
        await using var manager = fixture.CreateManager();
        await using var mechanic = fixture.CreateMechanic();

        var invitation = NewInvitation();
        manager.Invitations.Add(invitation);
        await manager.SaveChangesAsync();

        var invitations = new InvitationService(
            manager,
            new TestClock(),
            new RealMechanicDirectory(mechanic));

        var transaction =
            new CrossContextTransaction<ManagerDbContext, MechanicDbContext>(
                manager, mechanic);

        var before = await mechanic.Mechanics.CountAsync();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            transaction.ExecuteAsync(async ct =>
            {
                var orphan = new MechanicAccount
                {
                    Name = "ShouldRollBack",
                    Phone = "0779999888",
                    EmployeeCode = $"EMP-R{Guid.NewGuid():N}"[..12],
                    PinHash = "hash:1234",
                    InvitationId = invitation.Id,
                    CreatedAt = Now
                };

                mechanic.Mechanics.Add(orphan);
                await mechanic.SaveChangesAsync(ct);

                await invitations.MarkAcceptedAsync(
                    invitation.Id, Guid.NewGuid(), ct);
            }));

        mechanic.ChangeTracker.Clear();
        manager.ChangeTracker.Clear();

        Assert.Equal(before, await mechanic.Mechanics.CountAsync());

        Assert.False(await mechanic.Mechanics
            .AnyAsync(m => m.Name == "ShouldRollBack"));

        var savedInvite = await manager.Invitations
            .SingleAsync(i => i.Id == invitation.Id);

        Assert.Null(savedInvite.AcceptedAt);
        Assert.Null(savedInvite.MechanicId);
    }

    [Fact]
    public async Task Concurrent_mark_accepted_binds_only_one_mechanic()
    {
        await using var seedManager = fixture.CreateManager();
        await using var seedMechanic = fixture.CreateMechanic();

        var invitation = NewInvitation();
        seedManager.Invitations.Add(invitation);

        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();

        seedMechanic.Mechanics.AddRange(
            new MechanicAccount
            {
                Id = firstId,
                Name = "Alice",
                Phone = "0771000001",
                EmployeeCode = "EMP-A01",
                PinHash = "hash:1111",
                CreatedAt = Now
            },
            new MechanicAccount
            {
                Id = secondId,
                Name = "Bob",
                Phone = "0771000002",
                EmployeeCode = "EMP-B01",
                PinHash = "hash:2222",
                CreatedAt = Now
            });

        await seedManager.SaveChangesAsync();
        await seedMechanic.SaveChangesAsync();

        var invitationId = invitation.Id;

        await using var firstManager = fixture.CreateManager();
        await using var secondManager = fixture.CreateManager();

        var firstSnapshot = await firstManager.Invitations
            .SingleAsync(i => i.Id == invitationId);

        var secondSnapshot = await secondManager.Invitations
            .SingleAsync(i => i.Id == invitationId);

        Assert.Equal(0, firstSnapshot.Version);
        Assert.Equal(0, secondSnapshot.Version);

        async Task<Exception?> AttemptAsync(
            ManagerDbContext manager,
            Guid mechanicId)
        {
            try
            {
                await using var mechanicDb = fixture.CreateMechanic();

                var service = new InvitationService(
                    manager,
                    new TestClock(),
                    new RealMechanicDirectory(mechanicDb));

                await service.MarkAcceptedAsync(
                    invitationId, mechanicId);

                return null;
            }
            catch (Exception ex)
            {
                return ex;
            }
        }

        var results = await Task.WhenAll(
            AttemptAsync(firstManager, firstId),
            AttemptAsync(secondManager, secondId));

        var successes = results.Count(r => r is null);

        var conflicts = results.Count(r =>
            r is ConflictException
            {
                Code: "invitation_already_accepted"
            });

        Assert.Equal(1, successes);
        Assert.Equal(1, conflicts);

        await using var manager = fixture.CreateManager();

        var saved = await manager.Invitations
            .AsNoTracking()
            .SingleAsync(i => i.Id == invitationId);

        Assert.NotNull(saved.MechanicId);

        Assert.True(
            saved.MechanicId == firstId ||
            saved.MechanicId == secondId);

        Assert.Equal(1, saved.Version);
    }

    [Fact]
    public async Task Mark_accepted_requires_existing_mechanic_row()
    {
        await using var manager = fixture.CreateManager();
        await using var mechanic = fixture.CreateMechanic();

        var invitation = NewInvitation();
        manager.Invitations.Add(invitation);
        await manager.SaveChangesAsync();

        var service = new InvitationService(
            manager,
            new TestClock(),
            new RealMechanicDirectory(mechanic));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            service.MarkAcceptedAsync(
                invitation.Id, Guid.NewGuid()));

        manager.ChangeTracker.Clear();

        var saved = await manager.Invitations
            .SingleAsync(i => i.Id == invitation.Id);

        Assert.Null(saved.AcceptedAt);
        Assert.Null(saved.MechanicId);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Accept_and_revoke_preserve_first_saved_state(
        bool revokeFirst)
    {
        await using var seedManager = fixture.CreateManager();
        await using var mechanic = fixture.CreateMechanic();

        var invitation = NewInvitation();
        seedManager.Invitations.Add(invitation);

        var account = new MechanicAccount
        {
            Name = "Race Test",
            Phone = "0771234567",
            EmployeeCode = $"R-{Guid.NewGuid():N}"[..12],
            PinHash = "hash:1234",
            CreatedAt = Now
        };

        mechanic.Mechanics.Add(account);

        await mechanic.SaveChangesAsync();
        await seedManager.SaveChangesAsync();

        await using var acceptManager = fixture.CreateManager();
        await using var revokeManager = fixture.CreateManager();

        // Both requests track Version 0 before either saves.
        var acceptSnapshot = await acceptManager.Invitations
            .SingleAsync(i => i.Id == invitation.Id);

        var revokeSnapshot = await revokeManager.Invitations
            .SingleAsync(i => i.Id == invitation.Id);

        Assert.Equal(0, acceptSnapshot.Version);
        Assert.Equal(0, revokeSnapshot.Version);

        var directory = new RealMechanicDirectory(mechanic);

        var acceptService = new InvitationService(
            acceptManager, new TestClock(), directory);

        var revokeService = new InvitationService(
            revokeManager, new TestClock(), directory);

        if (revokeFirst)
        {
            await revokeService.RevokeAsync(invitation.Id);

            var error = await Assert.ThrowsAsync<AppException>(() =>
                acceptService.MarkAcceptedAsync(
                    invitation.Id, account.Id));

            Assert.Equal(410, error.Status);
            Assert.Equal("invite_expired", error.Code);
        }
        else
        {
            await acceptService.MarkAcceptedAsync(
                invitation.Id, account.Id);

            var error = await Assert.ThrowsAsync<ConflictException>(() =>
                revokeService.RevokeAsync(invitation.Id));

            Assert.Equal("invitation_already_accepted", error.Code);
        }

        await using var verify = fixture.CreateManager();

        var saved = await verify.Invitations
            .AsNoTracking()
            .SingleAsync(i => i.Id == invitation.Id);

        Assert.Equal(1, saved.Version);

        if (revokeFirst)
        {
            Assert.Equal(Now, saved.RevokedAt);
            Assert.Null(saved.AcceptedAt);
            Assert.Null(saved.MechanicId);
        }
        else
        {
            Assert.Null(saved.RevokedAt);
            Assert.Equal(Now, saved.AcceptedAt);
            Assert.Equal(account.Id, saved.MechanicId);
        }
    }

    private static MechanicAuthService CreateAuth(
        ManagerDbContext manager,
        MechanicDbContext mechanic)
    {
        var clock = new TestClock();

        var invitations = new InvitationService(
            manager,
            clock,
            new RealMechanicDirectory(mechanic));

        var transaction =
            new CrossContextTransaction<ManagerDbContext, MechanicDbContext>(
                manager, mechanic);

        return new MechanicAuthService(
            mechanic,
            new StubPasswords(),
            new StubTokens(),
            invitations,
            clock,
            transaction);
    }
}