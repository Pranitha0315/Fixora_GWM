using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Auth;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("mechanic-invitation-http", DisableParallelization = true)]
public sealed class MechanicInvitationHttpCollection;

/// <summary>
/// Conflict-safe tests-only: manager mechanic invitations create/list/revoke
/// and anonymous mechanic invite check/accept. No Confirm/CheckIn timing changes.
/// </summary>
[Collection("mechanic-invitation-http")]
public sealed class MechanicInvitationHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Manager_can_create_list_and_revoke_invitation()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var created = await manager.PostAsJsonAsync(
            "/api/v1/manager/mechanics/invitations",
            new CreateInvitationRequest("NID Invitee", "+94770001122"));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var invite = (await created.Content.ReadFromJsonAsync<InvitationDto>())!;
        Assert.Equal("Pending", invite.Status);
        Assert.False(string.IsNullOrWhiteSpace(invite.Token));
        Assert.Contains(invite.Token, invite.Link);

        // Shared ListAsync returns InvitationDto (includes Token/Link), not InvitationListDto.
        var list = (await manager.GetFromJsonAsync<List<InvitationDto>>(
            "/api/v1/manager/mechanics/invitations"))!;
        Assert.Contains(list, i => i.Id == invite.Id && i.Status == "Pending");

        var revoke = await manager.DeleteAsync(
            $"/api/v1/manager/mechanics/invitations/{invite.Id}");
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);

        var after = (await manager.GetFromJsonAsync<List<InvitationDto>>(
            "/api/v1/manager/mechanics/invitations"))!;
        Assert.Contains(after, i => i.Id == invite.Id && i.Status == "Revoked");
    }

    [Fact]
    public async Task Anonymous_can_check_pending_invite_and_accept_with_pin()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var anon = factory.CreateClient();

        var invite = (await (await manager.PostAsJsonAsync(
            "/api/v1/manager/mechanics/invitations",
            new CreateInvitationRequest("Join Mechanic", "+94771112233")))
            .Content.ReadFromJsonAsync<InvitationDto>())!;

        var check = await anon.GetAsync($"/api/v1/mechanic/auth/invitations/{invite.Token}");
        Assert.Equal(HttpStatusCode.OK, check.StatusCode);
        var info = (await check.Content.ReadFromJsonAsync<InvitationInfo>())!;
        Assert.Equal(invite.Id, info.Id);
        Assert.Equal("Join Mechanic", info.Name);

        var accept = await anon.PostAsJsonAsync(
            "/api/v1/mechanic/auth/invitations/accept",
            new AcceptInvitationRequest(invite.Token, "Join Mechanic", "9876"));
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        var tokens = (await accept.Content.ReadFromJsonAsync<AuthTokens>())!;
        Assert.False(string.IsNullOrWhiteSpace(tokens.AccessToken));

        var login = await anon.PostAsJsonAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-004", pin = "9876" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Revoked_invite_check_returns_gone()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var anon = factory.CreateClient();

        var invite = (await (await manager.PostAsJsonAsync(
            "/api/v1/manager/mechanics/invitations",
            new CreateInvitationRequest("Revoked One", "+94772223344")))
            .Content.ReadFromJsonAsync<InvitationDto>())!;

        Assert.Equal(HttpStatusCode.NoContent,
            (await manager.DeleteAsync(
                $"/api/v1/manager/mechanics/invitations/{invite.Id}")).StatusCode);

        var check = await anon.GetAsync($"/api/v1/mechanic/auth/invitations/{invite.Token}");
        Assert.Equal(HttpStatusCode.Gone, check.StatusCode);
    }

    [Fact]
    public async Task Create_invitation_requires_name_and_phone()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var response = await manager.PostAsJsonAsync(
            "/api/v1/manager/mechanics/invitations",
            new CreateInvitationRequest("", ""));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_manage_invitations()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/mechanics/invitations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                "/api/v1/manager/mechanics/invitations",
                new CreateInvitationRequest("x", "+94770000000"))).StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_list_manager_invitations()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/manager/mechanics/invitations")).StatusCode);
    }
}
