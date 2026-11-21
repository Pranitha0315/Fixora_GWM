using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Mechanic.Application.Common;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Fixora.Mechanic.Infrastructure.Ai;

public sealed class AiOptions
{
    /// <summary>"Template" (default, offline) or "Anthropic".</summary>
    public string Provider { get; set; } = "Template";
    public string? AnthropicApiKey { get; set; }
    public string Model { get; set; } = "claude-haiku-5-5";
    public int TimeoutSeconds { get; set; } = 8;
}

/// <summary>
/// Offline drafter: keeps the mechanic's own words, adds a structured bilingual frame per component.
/// Always available, so the workflow never blocks on AI (BR-FP-13, NFR-09).
/// </summary>
public sealed class TemplateInspectionDrafter : IInspectionDrafter
{
    private static readonly Dictionary<string, (string ta, string recEn, string recTa)> Components = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Brake pads"] = ("பிரேக் பேட்கள்", "Replace the brake pads and check the discs.", "பிரேக் பேட்களை மாற்றி டிஸ்க்குகளை சரிபார்க்கவும்."),
        ["Brake disc"] = ("பிரேக் டிஸ்க்", "Skim or replace the brake disc.", "பிரேக் டிஸ்க்கை சரிசெய்யவும் அல்லது மாற்றவும்."),
        ["Suspension"] = ("சஸ்பென்ஷன்", "Replace the worn shock absorbers / bushes.", "தேய்ந்த ஷாக் அப்சார்பர்களை மாற்றவும்."),
        ["Engine oil"] = ("என்ஜின் ஆயில்", "Change the engine oil and filter.", "என்ஜின் ஆயில் மற்றும் ஃபில்டரை மாற்றவும்."),
        ["Tyres"] = ("டயர்கள்", "Replace or rotate the tyres and check alignment.", "டயர்களை மாற்றி அலைன்மென்ட் சரிபார்க்கவும்."),
        ["Battery"] = ("பேட்டரி", "Test and replace the battery if weak.", "பேட்டரியை சோதித்து பலவீனமானால் மாற்றவும்."),
        ["Wiper blades"] = ("வைப்பர் பிளேடுகள்", "Replace the wiper blades.", "வைப்பர் பிளேடுகளை மாற்றவும்."),
        ["Air filter"] = ("ஏர் ஃபில்டர்", "Replace the air filter.", "ஏர் ஃபில்டரை மாற்றவும்."),
    };

    public Task<DraftOutput> DraftAsync(DraftInput input, CancellationToken ct = default)
    {
        var known = Components.TryGetValue(input.Component, out var c);
        var said = input.Transcript.Trim();
        var findingEn = input.Language == "en" ? $"{input.Component}: {said}" : $"{input.Component}: mechanic's note — \"{said}\"";
        var findingTa = input.Language == "ta" ? $"{(known ? c.ta : input.Component)}: {said}" : $"{(known ? c.ta : input.Component)}: மெக்கானிக் குறிப்பு — \"{said}\"";
        return Task.FromResult(new DraftOutput(findingEn, findingTa,
            known ? c.recEn : $"Repair or replace the {input.Component.ToLowerInvariant()} as advised.",
            known ? c.recTa : $"{input.Component} சரிசெய்யவும் அல்லது மாற்றவும்.",
            input.Severity, "template"));
    }
}

/// <summary>
/// LLM drafter with a fixed JSON schema. The model only rewrites what the mechanic said — no diagnosis,
/// no price. Any failure or timeout falls back to the template drafter.
/// </summary>
public sealed class AnthropicInspectionDrafter(HttpClient http, IOptions<AiOptions> options, TemplateInspectionDrafter fallback, ILogger<AnthropicInspectionDrafter> logger) : IInspectionDrafter
{
    private const string System = """
        You turn a car mechanic's spoken inspection note (Tamil, English or Tanglish) into a structured record.
        Use ONLY facts the mechanic said. Never add a diagnosis, cause, price or part the mechanic did not mention.
        Reply with JSON only: {"findingEn":"","findingTa":"","recommendationEn":"","recommendationTa":"","severity":"Safe|Attention|Urgent"}.
        Keep each field under 30 words. Tamil fields must be in Tamil script.
        """;

    public async Task<DraftOutput> DraftAsync(DraftInput input, CancellationToken ct = default)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.AnthropicApiKey)) return await fallback.DraftAsync(input, ct);
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(o.TimeoutSeconds));
            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
            req.Headers.Add("x-api-key", o.AnthropicApiKey);
            req.Headers.Add("anthropic-version", "2023-06-01");
            req.Content = JsonContent.Create(new
            {
                model = o.Model,
                max_tokens = 600,
                system = System,
                messages = new[] { new { role = "user", content = $"Component: {input.Component}\nMechanic severity: {input.Severity}\nNote ({input.Language}): {input.Transcript}" } },
            });
            using var res = await http.SendAsync(req, cts.Token);
            res.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(cts.Token));
            var text = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "";
            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            using var json = JsonDocument.Parse(text[start..(end + 1)]);
            var r = json.RootElement;
            var severity = r.TryGetProperty("severity", out var s) && s.GetString() is "Safe" or "Attention" or "Urgent" ? s.GetString()! : input.Severity;
            return new DraftOutput(r.GetProperty("findingEn").GetString() ?? "", r.GetProperty("findingTa").GetString() ?? "",
                r.GetProperty("recommendationEn").GetString() ?? "", r.GetProperty("recommendationTa").GetString() ?? "", severity, "ai");
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "AI draft failed; using template fallback");
            return await fallback.DraftAsync(input, ct);
        }
    }
}

/// <summary>No server-side STT configured: the app sends on-device transcription text instead.</summary>
public sealed class NullSpeechToText : ISpeechToText
{
    public Task<string?> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct = default) => Task.FromResult<string?>(null);
}
