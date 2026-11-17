using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Fixora.Tests.Integration;

[Collection("api")]
public sealed class InvitationListingTests(FixoraFactory factory)
{
    [Fact]
    public async Task Listing_excludes_token_and_link_but_creation_returns_them()
    {
        using var manager = await factory.Manager();

        using var created = await manager.PostAsJsonAsync(
            "/api/v1/manager/mechanics/invitations",
            new { name = "Listing Test Mechanic", phone = "0770000099" });

        created.EnsureSuccessStatusCode();

        using var createdJson = JsonDocument.Parse(
            await created.Content.ReadAsStringAsync());

        var invitation = createdJson.RootElement;
        var id = invitation.GetProperty("id").GetGuid();

        Assert.False(string.IsNullOrWhiteSpace(
            invitation.GetProperty("token").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(
            invitation.GetProperty("link").GetString()));

        using var response = await manager.GetAsync(
            "/api/v1/manager/mechanics/invitations");

        response.EnsureSuccessStatusCode();

        using var listJson = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync());

        var entries = listJson.RootElement.EnumerateArray().ToArray();

        Assert.Contains(entries, item =>
            item.GetProperty("id").GetGuid() == id);

        Assert.All(entries, item =>
        {
            Assert.False(item.TryGetProperty("token", out _));
            Assert.False(item.TryGetProperty("link", out _));
        });
    }
}
