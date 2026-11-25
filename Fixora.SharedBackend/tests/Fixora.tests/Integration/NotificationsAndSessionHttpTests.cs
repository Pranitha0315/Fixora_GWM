using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Customer.Application.Sos;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("notifications-session-http", DisableParallelization = true)]
public sealed class NotificationsAndSessionHttpCollection;

/// <summary>
/// Conflict-safe tests-only: shared notification inbox + auth refresh/logout/device
/// register. No Booking Confirm/CheckIn timing, no THA Host/production edits.
/// </summary>
[Collection("notifications-session-http")]
public sealed class NotificationsAndSessionHttpTests
{
    private const string NotificationsUrl = "/api/v1/notifications";
    private const string DevicesUrl = "/api/v1/devices";
    private const string RefreshUrl = "/api/v1/auth/refresh";
    private const string LogoutUrl = "/api/v1/auth/logout";

    private static FixoraFactory NewFactory() => new();

    private static async Task<AuthTokens> LoginManagerTokensAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/manager/auth/login",
            new { email = "manager@fixora.lk", password = "Fixora@123" });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthTokens>())!;
    }

    private static async Task RaiseStaffNotificationAsync(HttpClient kavitha)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/customer/sos/requests")
        {
            Content = JsonContent.Create(new CreateSosRequest(
                9.6615, 80.0255, "Other", DemoIds.VehicleWagonR, "notify staff", true))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"notif-{Guid.NewGuid():N}");
        (await kavitha.SendAsync(request)).EnsureSuccessStatusCode();
    }

    private static async Task<int> UnreadCountAsync(HttpClient client)
    {
        var response = await client.GetAsync($"{NotificationsUrl}/unread-count");
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("count").GetInt32();
    }

    [Fact]
    public async Task Manager_can_list_mark_read_and_clear_unread_notifications()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();

        await RaiseStaffNotificationAsync(kavitha);

        var before = await UnreadCountAsync(manager);
        Assert.True(before >= 1);

        var list = (await manager.GetFromJsonAsync<List<NotificationDto>>(
            $"{NotificationsUrl}?unreadOnly=true&take=50"))!;
        Assert.NotEmpty(list);
        Assert.Contains(list, n => n.Type == NotificationTypes.SosRaised);
        var target = list.First(n => n.Type == NotificationTypes.SosRaised);

        var mark = await manager.PostAsync($"{NotificationsUrl}/{target.Id}/read", null);
        Assert.Equal(HttpStatusCode.NoContent, mark.StatusCode);

        var afterOne = await UnreadCountAsync(manager);
        Assert.True(afterOne < before);

        var unreadOnly = (await manager.GetFromJsonAsync<List<NotificationDto>>(
            $"{NotificationsUrl}?unreadOnly=true"))!;
        Assert.DoesNotContain(unreadOnly, n => n.Id == target.Id);

        var clear = await manager.PostAsync($"{NotificationsUrl}/read-all", null);
        Assert.Equal(HttpStatusCode.NoContent, clear.StatusCode);
        Assert.Equal(0, await UnreadCountAsync(manager));
    }

    [Fact]
    public async Task Customer_cannot_mark_foreign_notification_and_anonymous_is_unauthorized()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        await RaiseStaffNotificationAsync(kavitha);

        var staffNote = (await manager.GetFromJsonAsync<List<NotificationDto>>(
            $"{NotificationsUrl}?unreadOnly=true"))!
            .First(n => n.Type == NotificationTypes.SosRaised);

        var foreign = await kavitha.PostAsync($"{NotificationsUrl}/{staffNote.Id}/read", null);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);

        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.GetAsync(NotificationsUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.GetAsync($"{NotificationsUrl}/unread-count")).StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_tokens_and_logout_revokes_refresh()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var tokens = await LoginManagerTokensAsync(client);

        var refreshedResponse = await client.PostAsJsonAsync(
            RefreshUrl,
            new { refreshToken = tokens.RefreshToken });
        Assert.Equal(HttpStatusCode.OK, refreshedResponse.StatusCode);
        var refreshed = (await refreshedResponse.Content.ReadFromJsonAsync<AuthTokens>())!;
        Assert.False(string.IsNullOrWhiteSpace(refreshed.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(refreshed.RefreshToken));
        Assert.NotEqual(tokens.RefreshToken, refreshed.RefreshToken);
        Assert.Equal(Roles.Manager, refreshed.Role);

        var logout = await client.PostAsJsonAsync(
            LogoutUrl,
            new { refreshToken = refreshed.RefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var afterLogout = await client.PostAsJsonAsync(
            RefreshUrl,
            new { refreshToken = refreshed.RefreshToken });
        Assert.True(
            afterLogout.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.BadRequest,
            $"expected auth failure after logout, got {afterLogout.StatusCode}");
    }

    [Fact]
    public async Task Device_register_accepts_token_and_rejects_empty()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        var ok = await manager.PostAsJsonAsync(
            DevicesUrl,
            new { token = $"fcm-d13-{Guid.NewGuid():N}", platform = "android" });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var bad = await manager.PostAsJsonAsync(
            DevicesUrl,
            new { token = "", platform = "android" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var error = (await bad.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Control_status_is_readable_and_customer_forbidden()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();

        var response = await manager.GetAsync("/api/v1/manager/control");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("mode").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("effectiveMode").GetString()));

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.GetAsync("/api/v1/manager/control")).StatusCode);
    }
}
