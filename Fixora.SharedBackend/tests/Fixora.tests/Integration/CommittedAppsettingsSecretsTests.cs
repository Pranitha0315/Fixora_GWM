using System.Text.Json;

namespace Fixora.Tests.Integration;

/// <summary>
/// BookingAudit S1 / F10: committed Host appsettings must not carry SQL passwords or Gemini keys.
/// Keys live only in git-ignored appsettings.Local.json.
/// </summary>
public sealed class CommittedAppsettingsSecretsTests
{
    private static string FindAppsettingsPath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "src", "Host", "Fixora.Host", "appsettings.json");
            if (File.Exists(candidate)) return candidate;
            // tests run from bin/.../net10.0 — walk up to repo / SharedBackend root
            candidate = Path.Combine(dir.FullName, "Fixora.SharedBackend", "src", "Host", "Fixora.Host", "appsettings.json");
            if (File.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }

        throw new FileNotFoundException("Could not locate Host appsettings.json from test output directory.");
    }

    [Fact]
    public void Committed_appsettings_has_empty_fixora_connection_string()
    {
        var json = File.ReadAllText(FindAppsettingsPath());
        using var doc = JsonDocument.Parse(json);
        var fixora = doc.RootElement
            .GetProperty("ConnectionStrings")
            .GetProperty("Fixora")
            .GetString();
        Assert.True(string.IsNullOrWhiteSpace(fixora), "ConnectionStrings:Fixora must be empty in committed appsettings.");
        Assert.DoesNotContain("Password=", fixora ?? "", StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Pwd=", fixora ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Committed_appsettings_has_no_gemini_api_key_secret()
    {
        var json = File.ReadAllText(FindAppsettingsPath());
        using var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.TryGetProperty("Ai", out var ai));
        if (!ai.TryGetProperty("GeminiApiKey", out var keyEl))
            return;

        var key = keyEl.GetString();
        Assert.True(string.IsNullOrWhiteSpace(key), "Ai:GeminiApiKey must be empty in committed appsettings.");
        Assert.DoesNotContain("AIza", key ?? "", StringComparison.Ordinal);
        Assert.False((key ?? "").StartsWith("PASTE-", StringComparison.OrdinalIgnoreCase) && (key?.Length ?? 0) > 10);
    }
}
