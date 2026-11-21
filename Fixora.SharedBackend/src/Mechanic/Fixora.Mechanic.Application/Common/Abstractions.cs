using Fixora.Mechanic.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Mechanic.Application.Common;

/// <summary>Mechanic-owned tables (schema "mechanic"): identity, unverified drafts, capture references.</summary>
public interface IMechanicDb
{
    DbSet<MechanicAccount> Mechanics { get; }
    DbSet<InspectionDraft> Drafts { get; }
    DbSet<CaptureMedia> Media { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

public sealed record DraftInput(string Component, string Transcript, string Language, string Severity);
public sealed record DraftOutput(string FindingEn, string FindingTa, string RecommendationEn, string RecommendationTa, string Severity, string Source);

/// <summary>
/// Turns a mechanic's spoken finding into a structured bilingual issue. AI drafts the words only —
/// it never diagnoses, prices or authorises (BRD §8). Must always return (template fallback, BR-FP-13).
/// </summary>
public interface IInspectionDrafter
{
    Task<DraftOutput> DraftAsync(DraftInput input, CancellationToken ct = default);
}

/// <summary>Speech-to-text for Tamil / English voice notes. Optional: the app may send device STT text instead.</summary>
public interface ISpeechToText
{
    Task<string?> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct = default);
}
