using System.Net;
using System.Net.Http.Json;
using Fixora.Mechanic.Application.Auth;
using Fixora.Shared.Contracts;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("mechanic-change-pin-http", DisableParallelization = true)]
public sealed class MechanicChangePinHttpCollection;

/// <summary>
/// Conflict-safe tests-only: mechanic PIN change + re-login. No Confirm/CheckIn timing.
/// </summary>
[Collection("mechanic-change-pin-http")]
public sealed class MechanicChangePinHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Mechanic_can_change_pin_and_login_with_new_pin()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var change = await ravi.PostAsJsonAsync(
            "/api/v1/mechanic/profile/pin",
            new ChangePinRequest("1234", "4321"));
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.PostAsJsonAsync(
                "/api/v1/mechanic/auth/pin-login",
                new { login = "EMP-001", pin = "1234" })).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await anon.PostAsJsonAsync(
                "/api/v1/mechanic/auth/pin-login",
                new { login = "EMP-001", pin = "4321" })).StatusCode);
    }

    [Fact]
    public async Task Wrong_current_pin_is_unauthorized()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(
            "/api/v1/mechanic/profile/pin",
            new ChangePinRequest("9999", "1111"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Non_digit_or_wrong_length_pin_is_bad_request()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        Assert.Equal(HttpStatusCode.BadRequest,
            (await ravi.PostAsJsonAsync(
                "/api/v1/mechanic/profile/pin",
                new ChangePinRequest("1234", "12"))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await ravi.PostAsJsonAsync(
                "/api/v1/mechanic/profile/pin",
                new ChangePinRequest("1234", "abcd"))).StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_change_pin()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                "/api/v1/mechanic/profile/pin",
                new ChangePinRequest("1234", "5678"))).StatusCode);
    }
}
