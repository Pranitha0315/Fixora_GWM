using System.Text.Json;
using Fixora.Mechanic.Application.Common;
using Fixora.Shared.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Fixora.Mechanic.Infrastructure.Ai;

/// <summary>
/// FX13-D06-NID-1 — Tamil / English speech-to-text with Gemini (free AI Studio key, same key as the Smart Advisor).
/// Returns null when not configured, the audio is unusable, or Gemini fails → the app lets the mechanic type instead.
/// </summary>
public sealed class GeminiSpeechToText(HttpClient http, IConfiguration config, ILogger<GeminiSpeechToText> logger) : ISpeechToText
{
    private const int MaxBytes = 15 * 1024 * 1024; // Gemini inline audio limit stays well below 20 MB

    private const string System = """
        You are a speech-to-text engine for a car garage in Sri Lanka. Transcribe the audio exactly as spoken.
        Tamil words in Tamil script; English words (car parts, numbers, brand names) as spoken in English.
        Do not translate, summarise or add anything. Output only the transcript. If there is no speech, output nothing.
        """;

    public async Task<string?> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct = default)
    {
        if (Gemini.ApiKey(config) is null) return null;
        using var buffer = new MemoryStream();
        await audio.CopyToAsync(buffer, ct);
        if (buffer.Length < 1024 || buffer.Length > MaxBytes)
        {
            logger.LogInformation("Voice note skipped: {Bytes} bytes (too short or too large)", buffer.Length);
            return null;
        }
        var bytes = buffer.ToArray();
        var hint = language.StartsWith("en", StringComparison.OrdinalIgnoreCase) ? "English (en-IN)" : "Tamil (ta-IN), may mix English words";
        var text = await Gemini.GenerateAsync(http, config, logger, System, $"Language hint: {hint}.", bytes, MimeOf(bytes, contentType), timeoutSeconds: 30, ct: ct);
        return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    }

    /// <summary>Trust the file header over the client's Content-Type (phones send odd types).</summary>
    internal static string MimeOf(byte[] b, string contentType)
    {
        bool Starts(params byte[] sig) => b.Length >= sig.Length && sig.Select((x, i) => b[i] == x).All(x => x);
        if (Starts(0x52, 0x49, 0x46, 0x46)) return "audio/wav";            // RIFF....WAVE
        if (Starts(0x1A, 0x45, 0xDF, 0xA3)) return "audio/webm";           // EBML (WebM / Opus)
        if (Starts(0x4F, 0x67, 0x67, 0x53)) return "audio/ogg";            // OggS
        if (Starts(0x66, 0x4C, 0x61, 0x43)) return "audio/flac";           // fLaC
        if (Starts(0x49, 0x44, 0x33) || Starts(0xFF, 0xFB)) return "audio/mp3";
        if (b.Length > 8 && b[4] == 0x66 && b[5] == 0x74 && b[6] == 0x79 && b[7] == 0x70) return "audio/aac"; // ftyp (m4a)
        return contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ? contentType : "audio/wav";
    }
}

/// <summary>
/// FX13-D06-NID-2 — FixProof draft with Gemini in JSON mode. Uses only the mechanic's words;
/// anything invalid or failed → TemplateInspectionDrafter (manual fallback always available, BR-FP-13).
/// </summary>
public sealed class GeminiInspectionDrafter(HttpClient http, IConfiguration config, TemplateInspectionDrafter fallback, ILogger<GeminiInspectionDrafter> logger) : IInspectionDrafter
{
    private const string System = """
        You turn a car mechanic's spoken inspection note (Tamil, English or Tanglish) into a structured record.
        Use ONLY facts the mechanic said. Never add a diagnosis, cause, price or part the mechanic did not mention.
        Reply with JSON only: {"findingEn":"","findingTa":"","recommendationEn":"","recommendationTa":"","severity":"Safe|Attention|Urgent"}.
        Keep each field under 30 words. Tamil fields must be in Tamil script.
        """;

    public async Task<DraftOutput> DraftAsync(DraftInput input, CancellationToken ct = default)
    {
        var text = await Gemini.GenerateAsync(http, config, logger, System,
            $"Component: {input.Component}\nMechanic severity: {input.Severity}\nNote ({input.Language}): {input.Transcript}", json: true, ct: ct);
        if (string.IsNullOrWhiteSpace(text)) return await fallback.DraftAsync(input, ct);
        try
        {
            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            if (start < 0 || end <= start) return await fallback.DraftAsync(input, ct);
            using var json = JsonDocument.Parse(text[start..(end + 1)]);
            var r = json.RootElement;
            string Field(string name) => r.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            if (Field("findingEn").Length == 0) return await fallback.DraftAsync(input, ct);
            var severity = Field("severity") is "Safe" or "Attention" or "Urgent" ? Field("severity") : input.Severity;
            return new DraftOutput(Field("findingEn"), Field("findingTa"), Field("recommendationEn"), Field("recommendationTa"), severity, "ai");
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Gemini draft was not valid JSON; using template fallback");
            return await fallback.DraftAsync(input, ct);
        }
    }
}
