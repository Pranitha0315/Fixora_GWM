using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

public enum InsightSeverity { Low, Medium, High }

public enum InsightStatus { Open, Actioned, Dismissed }

/// <summary>A deterministic detector result. Numbers come from code, never from the LLM.</summary>
public sealed class AdvisorInsight : Entity
{
    public DateOnly WeekStart { get; set; }
    public string Detector { get; set; } = "";
    public InsightSeverity Severity { get; set; }
    public string Title { get; set; } = "";
    public string Narrative { get; set; } = "";
    public string EvidenceJson { get; set; } = "{}";
    public int SampleSize { get; set; }
    public decimal RupeeImpact { get; set; }
    public string ActionType { get; set; } = "";
    public string ActionLabel { get; set; } = "";
    public InsightStatus Status { get; set; } = InsightStatus.Open;
    public int Feedback { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AdvisorAction : Entity
{
    public Guid InsightId { get; set; }
    public string ActionType { get; set; } = "";
    public Guid? LinkedEntityId { get; set; }
    public string OutcomeMetricKey { get; set; } = "";
    public decimal? OutcomeValue { get; set; }
    public string? OutcomeLabel { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class DetectorSetting : Entity
{
    public string Detector { get; set; } = "";
    public decimal ThresholdMultiplier { get; set; } = 1m;
    public bool Enabled { get; set; } = true;
}
