using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Manager.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("evidence-passport-http", DisableParallelization = true)]
public sealed class EvidencePassportHttpCollection;

/// <summary>
/// FX13-D08-NID-1 Slice 1 (tests-only): characterize Evidence Passport HTTP behaviour —
/// published vs unforwarded visibility, vehicle filter, authz, and signed media URL expiry.
/// Does not cover before/after timeline production mapping or typed Passport DTOs.
/// </summary>
[Collection("evidence-passport-http")]
public sealed class EvidencePassportHttpTests
{
    private const string EvidenceUrl = "/api/v1/customer/evidence";

    private static FixoraFactory NewFactory() => new();

    private static string DraftsUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}/fixproof/drafts";

    private static string ConfirmUrl(Guid jobId, Guid draftId)
        => $"/api/v1/mechanic/jobs/{jobId}/fixproof/drafts/{draftId}/confirm";

    private static string MediaUploadUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}/fixproof/media";

    private static string ProposeUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}/proposals";

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        return doc.RootElement.Clone();
    }

    private static async Task<string> UploadMediaRefAsync(HttpClient mechanic, Guid jobId)
    {
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9, 0x01, 0x02, 0x03, 0x04 });
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, "file", "nid8-pad.jpg");
        content.Add(new StringContent("Before"), "phase");

        var response = await mechanic.PostAsync(MediaUploadUrl(jobId), content);
        response.EnsureSuccessStatusCode();
        var body = await ReadJsonAsync(response);
        return body.GetProperty("mediaRef").GetString()
               ?? throw new InvalidOperationException("mediaRef missing from upload response");
    }

    /// <summary>Confirm a unique finding (optionally with media). Does not manager-forward.</summary>
    private static async Task<(string Marker, Guid IssueId)> ConfirmFindingAsync(
        HttpClient mechanic,
        Guid jobId,
        string marker,
        string? mediaRef = null)
    {
        var create = await mechanic.PostAsJsonAsync(
            DraftsUrl(jobId),
            new
            {
                component = "Brake pads",
                transcript = "",
                language = "en",
                severity = "Urgent",
                mediaRefs = mediaRef is null ? Array.Empty<string>() : new[] { mediaRef },
            });
        create.EnsureSuccessStatusCode();
        var draft = await ReadJsonAsync(create);
        var draftId = draft.GetProperty("id").GetGuid();

        (await mechanic.PutAsJsonAsync(
            $"{DraftsUrl(jobId)}/{draftId}",
            new
            {
                component = "Brake pads",
                findingEn = marker,
                findingTa = "NID8 தமிழ் கண்டுபிடிப்பு",
                recommendationEn = "Replace pads.",
                recommendationTa = "பேட்களை மாற்றவும்.",
                severity = "Urgent",
            })).EnsureSuccessStatusCode();

        var confirmedResponse = await mechanic.PostAsync(ConfirmUrl(jobId, draftId), content: null);
        confirmedResponse.EnsureSuccessStatusCode();
        var confirmed = await ReadJsonAsync(confirmedResponse);
        var issueId = confirmed.GetProperty("publishedIssueId").GetGuid();
        Assert.NotEqual(Guid.Empty, issueId);
        return (marker, issueId);
    }

    private static async Task ForwardProposalAsync(HttpClient mechanic, HttpClient manager, Guid jobId)
    {
        var submit = await mechanic.PostAsJsonAsync(
            ProposeUrl(jobId),
            new SubmitProposalRequest(
                new[]
                {
                    new ProposalItemInput("Front brake pads", "Part", 1, 4200m, null, DemoIds.PartBrakePads),
                    new ProposalItemInput("Brake labour", "Labour", 1, 1500m, null, null),
                },
                "NID8 evidence passport publish"));
        submit.EnsureSuccessStatusCode();
        var proposal = (await submit.Content.ReadFromJsonAsync<ProposalDto>())!;

        (await manager.PostAsJsonAsync(
            $"/api/v1/manager/approvals/proposals/{proposal.Id}/forward",
            new { note = "Publish findings with proposal" })).EnsureSuccessStatusCode();
    }

    private static bool EvidenceContainsFinding(JsonElement list, string marker)
        => list.ValueKind == JsonValueKind.Array
           && list.EnumerateArray().Any(row =>
               row.TryGetProperty("issue", out var issue)
               && issue.TryGetProperty("findingEn", out var finding)
               && finding.GetString() == marker);

    private static JsonElement? FindEvidenceRow(JsonElement list, string marker)
    {
        if (list.ValueKind != JsonValueKind.Array) return null;
        foreach (var row in list.EnumerateArray())
        {
            if (row.TryGetProperty("issue", out var issue)
                && issue.TryGetProperty("findingEn", out var finding)
                && finding.GetString() == marker)
            {
                return row.Clone();
            }
        }

        return null;
    }

    [Fact]
    public async Task Published_evidence_appears_after_confirm_and_manager_forward()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();
        var marker = $"NID8-PUBLISHED-{Guid.NewGuid():N}";
        var jobId = DemoIds.JobKavithaToday;

        var mediaRef = await UploadMediaRefAsync(ravi, jobId);
        await ConfirmFindingAsync(ravi, jobId, marker, mediaRef);
        await ForwardProposalAsync(ravi, manager, jobId);

        var response = await kavitha.GetAsync(EvidenceUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await ReadJsonAsync(response);
        var row = FindEvidenceRow(list, marker);
        Assert.NotNull(row);

        Assert.Equal(jobId, row!.Value.GetProperty("jobId").GetGuid());
        Assert.Equal(DemoIds.VehicleWagonR, row.Value.GetProperty("vehicleId").GetGuid());

        var issue = row.Value.GetProperty("issue");
        Assert.Equal(marker, issue.GetProperty("findingEn").GetString());
        var mediaUrls = issue.GetProperty("mediaUrls");
        Assert.Equal(JsonValueKind.Array, mediaUrls.ValueKind);
        Assert.NotEmpty(mediaUrls.EnumerateArray());
        var url = mediaUrls[0].GetString();
        Assert.False(string.IsNullOrWhiteSpace(url));
        Assert.Contains("/api/v1/media/", url, StringComparison.Ordinal);
        Assert.Contains("exp=", url, StringComparison.Ordinal);
        Assert.Contains("sig=", url, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unforwarded_confirmed_finding_is_not_on_evidence_passport()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var kavitha = await factory.Customer();
        var marker = $"NID8-UNFORWARDED-{Guid.NewGuid():N}";

        await ConfirmFindingAsync(ravi, DemoIds.JobKavithaToday, marker);

        var response = await kavitha.GetAsync(EvidenceUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await ReadJsonAsync(response);
        Assert.False(EvidenceContainsFinding(list, marker));
    }

    [Fact]
    public async Task Evidence_passport_filters_by_vehicle_id()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();
        var marker = $"NID8-VEHICLE-{Guid.NewGuid():N}";
        var jobId = DemoIds.JobKavithaToday;

        await ConfirmFindingAsync(ravi, jobId, marker);
        await ForwardProposalAsync(ravi, manager, jobId);

        var ownVehicle = await kavitha.GetAsync($"{EvidenceUrl}?vehicleId={DemoIds.VehicleWagonR}");
        Assert.Equal(HttpStatusCode.OK, ownVehicle.StatusCode);
        Assert.True(EvidenceContainsFinding(await ReadJsonAsync(ownVehicle), marker));

        var otherVehicle = await kavitha.GetAsync($"{EvidenceUrl}?vehicleId={DemoIds.VehicleArunAxio}");
        Assert.Equal(HttpStatusCode.OK, otherVehicle.StatusCode);
        Assert.False(EvidenceContainsFinding(await ReadJsonAsync(otherVehicle), marker));
    }

    [Fact]
    public async Task Anonymous_evidence_passport_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync(EvidenceUrl);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Other_customer_does_not_see_foreign_published_evidence()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var arun = await ArunAsync(factory);
        var marker = $"NID8-ISOLATION-{Guid.NewGuid():N}";

        await ConfirmFindingAsync(ravi, DemoIds.JobKavithaToday, marker);
        await ForwardProposalAsync(ravi, manager, DemoIds.JobKavithaToday);

        var response = await arun.GetAsync(EvidenceUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(EvidenceContainsFinding(await ReadJsonAsync(response), marker));
    }

    [Fact]
    public async Task Signed_media_url_rejects_expired_and_invalid_signature()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var anon = factory.CreateClient();

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9, 0x0A, 0x0B });
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, "file", "nid8-sig.jpg");
        content.Add(new StringContent("Before"), "phase");

        var upload = await ravi.PostAsync(MediaUploadUrl(DemoIds.JobKavithaToday), content);
        upload.EnsureSuccessStatusCode();
        var uploaded = await ReadJsonAsync(upload);
        var previewUrl = uploaded.GetProperty("previewUrl").GetString()
                         ?? throw new InvalidOperationException("previewUrl missing");

        Assert.StartsWith("/api/v1/media/", previewUrl, StringComparison.Ordinal);

        var valid = await anon.GetAsync(previewUrl);
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);

        var parts = previewUrl.Split('?', 2);
        var path = parts[0];
        var query = ParseQuery(parts.Length > 1 ? parts[1] : "");
        Assert.True(query.TryGetValue("sig", out var sig) && !string.IsNullOrWhiteSpace(sig));
        Assert.True(query.TryGetValue("exp", out var exp) && !string.IsNullOrWhiteSpace(exp));

        var expired = await anon.GetAsync($"{path}?exp=1&sig={sig}");
        Assert.Equal(HttpStatusCode.NotFound, expired.StatusCode);

        var badSig = await anon.GetAsync($"{path}?exp={exp}&sig=deadbeef");
        Assert.Equal(HttpStatusCode.NotFound, badSig.StatusCode);
    }

    private static Dictionary<string, string> ParseQuery(string query)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            if (kv.Length == 2)
                map[Uri.UnescapeDataString(kv[0])] = Uri.UnescapeDataString(kv[1]);
        }

        return map;
    }
}
