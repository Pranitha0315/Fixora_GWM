namespace Fixora.Shared.Contracts;

/// <summary>Error contract shared by all three APIs (BRD §16).</summary>
public sealed record ApiErrorResponse(
    int Status,
    string Code,
    string Message,
    string CorrelationId,
    IDictionary<string, string[]>? Errors = null);
