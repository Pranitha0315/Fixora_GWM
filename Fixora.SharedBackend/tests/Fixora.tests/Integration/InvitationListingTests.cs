using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Fixora.Tests.Integration;

/// <summary>
/// Characterizes Shared invitation list DTO: ListAsync maps via ToDto which includes token and link.
/// </summary>
[Collection("api")]
public sealed class InvitationListingTests(FixoraFactory factory)
{
    [Fact]
    public async Task Listing_includes_token_and_link_like_creation()
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
        var createdToken = invitation.GetProperty("token").GetString();
        var createdLink = invitation.GetProperty("link").GetString();

        Assert.False(string.IsNullOrWhiteSpace(createdToken));
        Assert.False(string.IsNullOrWhiteSpace(createdLink));

        using var response = await manager.GetAsync(
            "/api/v1/manager/mechanics/invitations");

        response.EnsureSuccessStatusCode();

        using var listJson = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync());

        var entries = listJson.RootElement.EnumerateArray().ToArray();

        var listed = Assert.Single(entries, item =>
            item.GetProperty("id").GetGuid() == id);

        Assert.Equal(createdToken, listed.GetProperty("token").GetString());
        Assert.Equal(createdLink, listed.GetProperty("link").GetString());
    }
}
