using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("fixproof-transcribe-http", DisableParallelization = true)]
public sealed class FixProofTranscribeHttpCollection;

/// <summary>
/// FX13-D06-NID-1 (first slice): characterize the current FixProof transcribe HTTP contract
/// under NullSpeechToText. Does not claim real STT, language validation, or job-assignment gating.
/// </summary>
[Collection("fixproof-transcribe-http")]
public sealed class FixProofTranscribeHttpTests : IAsyncLifetime
{
    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<HttpClient> RaviAsync() => await _factory.Mechanic();

    private async Task<HttpClient> CustomerAsync() => await _factory.Customer();

    private static MultipartFormDataContent BuildAudioForm(string language)
    {
        // Minimal bytes labeled as audio/wav — NullSpeechToText ignores content and returns null.
        var audio = new ByteArrayContent(new byte[] { 0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00 });
        audio.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");

        var form = new MultipartFormDataContent
        {
            { audio, "audio", "note.wav" },
            { new StringContent(language), "language" }
        };
        return form;
    }

    private static async Task AssertNullSttContractAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("transcript", out var transcript));
        Assert.Equal(JsonValueKind.Null, transcript.ValueKind);

        Assert.True(root.TryGetProperty("available", out var available));
        Assert.False(available.GetBoolean());
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_ta_returns_null_stt_contract()
    {
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("ta");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertNullSttContractAsync(response);
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_en_returns_null_stt_contract()
    {
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("en");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertNullSttContractAsync(response);
    }

    [Fact]
    public async Task Anonymous_transcribe_returns_unauthorized()
    {
        var client = _factory.CreateClient();
        using var form = BuildAudioForm("ta");

        var response = await client.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_token_transcribe_returns_forbidden()
    {
        var customer = await CustomerAsync();
        using var form = BuildAudioForm("ta");

        var response = await customer.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
