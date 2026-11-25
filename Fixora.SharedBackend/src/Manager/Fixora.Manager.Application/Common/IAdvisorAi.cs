namespace Fixora.Manager.Application.Common;

/// <summary>
/// Optional language model for the Smart Advisor chat (FX13-D12-THA-2 "AI template fallback").
/// It only phrases an answer from the facts it is given — every number is computed in code.
/// null = not configured / quota hit / failed → AdvisorService answers from its built-in templates.
/// </summary>
public interface IAdvisorAi
{
    Task<string?> AnswerAsync(string question, string factsJson, CancellationToken ct = default);
}

/// <summary>No AI configured: the advisor answers from its templates.</summary>
public sealed class NoAdvisorAi : IAdvisorAi
{
    public Task<string?> AnswerAsync(string question, string factsJson, CancellationToken ct = default) => Task.FromResult<string?>(null);
}
