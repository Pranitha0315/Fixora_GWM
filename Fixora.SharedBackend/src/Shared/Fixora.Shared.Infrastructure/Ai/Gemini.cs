using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Fixora.Shared.Infrastructure.Ai;

/// <summary>
/// Google Gemini (AI Studio key, free tier, no card). One key covers all three AI features:
/// speech-to-text (audio in), the FixProof draft (JSON out) and the Smart Advisor chat.
/// Settings: Ai:GeminiApiKey, Ai:GeminiModel (default gemini-flash-lite-latest: fast on the free tier),
/// Ai:GeminiEndpoint (tests only). Returns null on any failure, so every caller keeps its offline fallback.
/// </summary>
public static class Gemini
{
    public const string DefaultModel = "gemini-flash-lite-latest";
    private const string DefaultEndpoint = "https://generativelanguage.googleapis.com/v1beta/models";

    /// <summary>The key, or null when it is empty or still the "PASTE-..." placeholder (then callers use their fallback).</summary>
    public static string? ApiKey(IConfiguration config) =>
        config["Ai:GeminiApiKey"]?.Trim() is { Length: > 0 } k && !k.StartsWith("PASTE-", StringComparison.OrdinalIgnoreCase) ? k : null;

    public static async Task<string?> GenerateAsync(
        HttpClient http, IConfiguration config, ILogger logger,
        string system, string userText,
        byte[]? audio = null, string audioMime = "audio/wav",
        bool json = false, int timeoutSeconds = 20, CancellationToken ct = default)
    {
        var key = ApiKey(config);
        if (key is null) return null;
        var model = config["Ai:GeminiModel"] is { Length: > 0 } m ? m : DefaultModel;
        var endpoint = (config["Ai:GeminiEndpoint"] is { Length: > 0 } e ? e : DefaultEndpoint).TrimEnd('/');

        var parts = new List<object> { new { text = userText } };
        if (audio is not null) parts.Add(new { inlineData = new { mimeType = audioMime, data = Convert.ToBase64String(audio) } });
        var body = new Dictionary<string, object>
        {
            ["systemInstruction"] = new { parts = new[] { new { text = system } } },
            ["contents"] = new[] { new { role = "user", parts } },
        };
        if (json) body["generationConfig"] = new { responseMimeType = "application/json" };

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{endpoint}/{model}:generateContent")
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            req.Headers.Add("x-goog-api-key", key); // header, never the URL: keeps the key out of request logs
            using var res = await http.SendAsync(req, cts.Token);
            var text = await res.Content.ReadAsStringAsync(cts.Token);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogWarning("Gemini {Model} returned {Status}: {Body}", model, (int)res.StatusCode, text.Length > 300 ? text[..300] : text);
                return null;
            }
            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0) return "";
            var sb = new StringBuilder();
            if (candidates[0].TryGetProperty("content", out var content) && content.TryGetProperty("parts", out var outParts))
                foreach (var p in outParts.EnumerateArray())
                    if (p.TryGetProperty("text", out var t)) sb.Append(t.GetString());
            return sb.ToString().Trim();
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Gemini {Model} call failed", model);
            return null;
        }
    }
}
