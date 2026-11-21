using Fixora.SharedKernel;

namespace Fixora.Mechanic.Domain;

/// <summary>Mechanic identity for Fixora Rev: 4-digit PIN on a shared workshop phone (BR-SF-17).</summary>
public sealed class MechanicAccount : Entity
{
    public const int MaxFailedPins = 5;

    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string EmployeeCode { get; set; } = "";
    public string PinHash { get; set; } = "";
    public bool Active { get; set; } = true;
    public bool OnDuty { get; set; } = true;
    public string PreferredLanguage { get; set; } = "ta";
    public int FailedPinAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
    public Guid? InvitationId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public void RegisterFailedPin(DateTime now)
    {
        FailedPinAttempts++;
        if (FailedPinAttempts >= MaxFailedPins)
        {
            LockedUntil = now.AddMinutes(15);
            FailedPinAttempts = 0;
        }
    }
}

public enum DraftStatus { Draft, Confirmed, Discarded }

/// <summary>
/// FixProof capture before confirmation. Lives only in the mechanic schema and is never exposed
/// through the customer API (BR-FP-04, AC-02). Confirmation publishes a verified issue to the manager context.
/// </summary>
public sealed class InspectionDraft : Entity
{
    public Guid JobCardId { get; set; }
    public Guid MechanicId { get; set; }
    public string Component { get; set; } = "";
    public string Transcript { get; set; } = "";
    public string Language { get; set; } = "ta";
    public string Severity { get; set; } = "Attention";
    public string FindingEn { get; set; } = "";
    public string FindingTa { get; set; } = "";
    public string RecommendationEn { get; set; } = "";
    public string RecommendationTa { get; set; } = "";
    public string MediaRefsCsv { get; set; } = "";
    /// <summary>"ai", "template" or "manual" — shown as "AI draft · unverified" until confirmed.</summary>
    public string Source { get; set; } = "manual";
    public DraftStatus Status { get; set; } = DraftStatus.Draft;
    public Guid? PublishedIssueId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
}

public enum MediaPhase { Before, During, After }

public sealed class CaptureMedia : Entity
{
    public Guid JobCardId { get; set; }
    public Guid MechanicId { get; set; }
    public string MediaRef { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public MediaPhase Phase { get; set; } = MediaPhase.Before;
    public string? Caption { get; set; }
    public DateTime CapturedAt { get; set; }
}
