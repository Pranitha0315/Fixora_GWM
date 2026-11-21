using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("fixproof-draft-confirm-http", DisableParallelization = true)]
public sealed class FixProofDraftConfirmHttpCollection;

/// <summary>
/// FX13-D06-NID-2 (tests-only): characterize current FixProof draft / manual fallback /
/// template draft / confirm HTTP behaviour. Does not claim Anthropic JSON-schema LLM,
/// immutable publish rules, or customer visibility of confirmed issues before manager forward.
/// </summary>
[Collection("fixproof-draft-confirm-http")]
public sealed class FixProofDraftConfirmHttpTests : IAsyncLifetime
{
    private const string UniqueTranscriptMarker = "NID2-UNCONFIRMED-MARKER pad thickness 2mm scored";

    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<HttpClient> RaviAsync() => await _factory.Mechanic();

    private async Task<HttpClient> CustomerAsync() => await _factory.Customer();

    private static string DraftsUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}/fixproof/drafts";

    private static string ConfirmUrl(Guid jobId, Guid draftId)
        => $"/api/v1/mechanic/jobs/{jobId}/fixproof/drafts/{draftId}/confirm";

    private static string CustomerReportUrl(Guid jobId)
        => $"/api/v1/customer/fixproof/jobs/{jobId}/report";

    private static object CreateDraftBody(string? transcript, string component = "Brake pads") => new
    {
        component,
        transcript,
        language = "en",
        severity = "Urgent",
        mediaRefs = Array.Empty<string>()
    };

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Assigned_mechanic_empty_transcript_creates_manual_unverified_draft()
    {
        var ravi = await RaviAsync();

        var response = await ravi.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: ""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var draft = await ReadJsonAsync(response);

        Assert.Equal("manual", draft.GetProperty("source").GetString());
        Assert.False(draft.GetProperty("verified").GetBoolean());
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        Assert.Equal("", draft.GetProperty("findingEn").GetString());
        Assert.Equal(JsonValueKind.Null, draft.GetProperty("publishedIssueId").ValueKind);
    }

    [Fact]
    public async Task Assigned_mechanic_nonempty_transcript_creates_template_unverified_draft()
    {
        var ravi = await RaviAsync();

        var response = await ravi.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: "pad thickness low, disc scored"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var draft = await ReadJsonAsync(response);

        Assert.Equal("template", draft.GetProperty("source").GetString());
        Assert.False(draft.GetProperty("verified").GetBoolean());
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        Assert.False(string.IsNullOrWhiteSpace(draft.GetProperty("findingEn").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(draft.GetProperty("findingTa").GetString()));
        Assert.Contains("pad thickness low", draft.GetProperty("findingEn").GetString()!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Unconfirmed_draft_text_is_not_visible_on_customer_fixproof_report()
    {
        var ravi = await RaviAsync();
        var create = await ravi.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: UniqueTranscriptMarker));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var draft = await ReadJsonAsync(create);
        Assert.False(draft.GetProperty("verified").GetBoolean());

        var kavitha = await CustomerAsync();
        var reportResponse = await kavitha.GetAsync(CustomerReportUrl(DemoIds.JobKavithaToday));
        Assert.Equal(HttpStatusCode.OK, reportResponse.StatusCode);
        var report = await ReadJsonAsync(reportResponse);

        Assert.True(report.TryGetProperty("issues", out var issues));
        var leaked = issues.EnumerateArray().Any(issue =>
            (issue.TryGetProperty("findingEn", out var en) && en.GetString()?.Contains(UniqueTranscriptMarker, StringComparison.Ordinal) == true)
            || (issue.TryGetProperty("findingTa", out var ta) && ta.GetString()?.Contains(UniqueTranscriptMarker, StringComparison.Ordinal) == true));

        Assert.False(leaked);
    }

    [Fact]
    public async Task Confirm_without_findingEn_is_rejected_then_update_and_confirm_succeeds()
    {
        var ravi = await RaviAsync();
        var create = await ravi.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: ""));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await ReadJsonAsync(create);
        var draftId = created.GetProperty("id").GetGuid();
        Assert.Equal("", created.GetProperty("findingEn").GetString());

        var rejected = await ravi.PostAsync(ConfirmUrl(DemoIds.JobKavithaToday, draftId), content: null);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        var error = await rejected.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", error.GetProperty("code").GetString());

        var update = await ravi.PutAsJsonAsync(
            $"{DraftsUrl(DemoIds.JobKavithaToday)}/{draftId}",
            new
            {
                component = "Brake pads",
                findingEn = "Brake pads worn below limit.",
                findingTa = "பிரேக் பேட்கள் தேய்ந்துள்ளன.",
                recommendationEn = "Replace brake pads.",
                recommendationTa = "பிரேக் பேட்களை மாற்றவும்.",
                severity = "Urgent"
            });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var confirmedResponse = await ravi.PostAsync(ConfirmUrl(DemoIds.JobKavithaToday, draftId), content: null);
        Assert.Equal(HttpStatusCode.OK, confirmedResponse.StatusCode);
        var confirmed = await ReadJsonAsync(confirmedResponse);

        Assert.True(confirmed.GetProperty("verified").GetBoolean());
        Assert.Equal("Confirmed", confirmed.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, confirmed.GetProperty("publishedIssueId").ValueKind);
        Assert.NotEqual(Guid.Empty, confirmed.GetProperty("publishedIssueId").GetGuid());
    }

    [Fact]
    public async Task Anonymous_create_draft_returns_unauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: "note"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_token_create_draft_returns_forbidden()
    {
        var customer = await CustomerAsync();
        var response = await customer.PostAsJsonAsync(
            DraftsUrl(DemoIds.JobKavithaToday),
            CreateDraftBody(transcript: "note"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
