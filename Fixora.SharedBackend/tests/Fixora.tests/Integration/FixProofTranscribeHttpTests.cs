using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Mechanic.Application.Common;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("fixproof-transcribe-http", DisableParallelization = true)]
public sealed class FixProofTranscribeHttpCollection;

/// <summary>
/// FixProof transcribe HTTP contract under NullSpeechToText and auth gates.
/// FX13-D06-NID-1: STT failures return 200 with available=false + reason (typing fallback).
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

    private static MultipartFormDataContent BuildAudioForm(string language, byte[]? audioBytes = null)
    {
        // Default: minimal bytes labeled as audio/wav — NullSpeechToText ignores content and returns null.
        var bytes = audioBytes ?? new byte[] { 0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00 };
        var audio = new ByteArrayContent(bytes);
        audio.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");

        var form = new MultipartFormDataContent
        {
            { audio, "audio", "note.wav" },
            { new StringContent(language), "language" }
        };
        return form;
    }

    private static async Task AssertUnavailableSttContractAsync(HttpResponseMessage response, string? reasonContains = null)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("transcript", out var transcript));
        Assert.Equal(JsonValueKind.Null, transcript.ValueKind);

        Assert.True(root.TryGetProperty("available", out var available));
        Assert.False(available.GetBoolean());

        Assert.True(root.TryGetProperty("reason", out var reason));
        Assert.Equal(JsonValueKind.String, reason.ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(reason.GetString()));
        if (reasonContains is not null)
            Assert.Contains(reasonContains, reason.GetString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_ta_returns_null_stt_contract()
    {
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("ta");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertUnavailableSttContractAsync(response);
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_en_returns_null_stt_contract()
    {
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("en");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertUnavailableSttContractAsync(response);
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

    [Fact]
    public async Task Assigned_mechanic_empty_audio_returns_validation_failed()
    {
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("ta", Array.Empty<byte>());

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("empty", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Assigned_mechanic_audio_over_15mb_returns_validation_failed()
    {
        // App Guard is 15 MB; RequestSizeLimit is 16 MB — 15 MB + 1 hits validation_failed, not 413.
        var ravi = await RaviAsync();
        using var form = BuildAudioForm("ta", new byte[15 * 1024 * 1024 + 1]);

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("too long", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("15 MB", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_when_stt_throws_returns_unavailable_with_reason()
    {
        // NID Gemini pack: provider failures never 500 — typing fallback via available=false + reason.
        await using var factory = new ThrowingSttFixoraFactory(() =>
            throw new InvalidOperationException("STT provider unavailable"));
        var ravi = await factory.Mechanic();
        using var form = BuildAudioForm("ta");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertUnavailableSttContractAsync(response, "Speech-to-text is not available");
    }

    [Fact]
    public async Task Assigned_mechanic_transcribe_when_stt_times_out_returns_unavailable_with_reason()
    {
        // TaskCanceledException from STT (request ct not cancelled) → available=false, not 500.
        await using var factory = new ThrowingSttFixoraFactory(() =>
            throw new TaskCanceledException("STT timed out"));
        var ravi = await factory.Mechanic();
        using var form = BuildAudioForm("en");

        var response = await ravi.PostAsync(
            $"/api/v1/mechanic/jobs/{DemoIds.JobKavithaToday}/fixproof/transcribe",
            form);

        await AssertUnavailableSttContractAsync(response, "Speech-to-text is not available");
    }

    /// <summary>Isolated host that replaces <see cref="ISpeechToText"/> with a throwing double.</summary>
    private sealed class ThrowingSttFixoraFactory : WebApplicationFactory<Program>
    {
        private readonly Func<Exception> _fault;

        public ThrowingSttFixoraFactory(Func<Exception> fault)
        {
            _fault = fault;
            Environment.SetEnvironmentVariable("Database__Provider", "InMemory");
            Environment.SetEnvironmentVariable("Database__InMemoryName", $"fixora-tests-stt-{Guid.NewGuid():N}");
            Environment.SetEnvironmentVariable("Workers__Enabled", "false");
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureTestServices(services =>
            {
                foreach (var d in services.Where(d => d.ServiceType == typeof(ISpeechToText)).ToList())
                    services.Remove(d);
                services.AddSingleton<ISpeechToText>(new ThrowingSpeechToText(_fault));
            });
        }

        public async Task<HttpClient> Mechanic()
        {
            var client = CreateClient();
            var res = await client.PostAsJsonAsync("/api/v1/mechanic/auth/pin-login", new { login = "EMP-001", pin = "1234" });
            res.EnsureSuccessStatusCode();
            var tokens = await res.Content.ReadFromJsonAsync<AuthTokens>();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", tokens!.AccessToken);
            return client;
        }
    }

    private sealed class ThrowingSpeechToText(Func<Exception> fault) : ISpeechToText
    {
        public Task<string?> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct = default)
            => Task.FromException<string?>(fault());
    }
}
