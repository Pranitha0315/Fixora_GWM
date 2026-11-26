using Fixora.Manager.Application.Common;
using Fixora.Shared.Infrastructure.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Fixora.Manager.Infrastructure.Ai;

/// <summary>Smart Advisor chat with Google Gemini (free AI Studio key). Grounded: answers only from the JSON facts.</summary>
public sealed class GeminiAdvisorAi(HttpClient http, IConfiguration config, ILogger<GeminiAdvisorAi> logger) : IAdvisorAi
{
    internal const string Prompt = """
        You are the Smart Advisor inside a car-garage management system in Sri Lanka, talking to the garage manager.
        Answer the manager's question using ONLY the JSON facts provided. Never invent a number, name, part or price
        that is not in the facts; if the facts do not cover the question, say so in one sentence and suggest what they can ask.
        Money is in Sri Lankan rupees (write "Rs 12,500"). Reply in the language of the question: English, Tamil (Tamil script)
        or Tanglish. Keep it under 80 words, plain sentences, and end with one concrete action when it makes sense.
        """;

    public async Task<string?> AnswerAsync(string question, string factsJson, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(question)) return null;
        var answer = await Gemini.GenerateAsync(http, config, logger, Prompt,
            $"Facts (JSON):\n{factsJson}\n\nManager's question: {question}", ct: ct);
        return string.IsNullOrWhiteSpace(answer) ? null : answer;
    }
}
