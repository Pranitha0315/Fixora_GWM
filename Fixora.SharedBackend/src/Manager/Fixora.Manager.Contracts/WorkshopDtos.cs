namespace Fixora.Manager.Contracts;

public sealed record GarageDto(Guid Id, string Name, string Phone, string EmergencyPhone, string Address, double Lat, double Lng,
    string OpenTime, string CloseTime, bool OpenNow, string? NextOpening, bool LoyaltyEnabled, decimal LoyaltyPercent, decimal LoyaltyCapRupees);

public sealed record ServiceDto(Guid Id, string Name, string Category, int StandardMinutes, decimal BasePrice);

public sealed record SlotDto(DateTime Start, DateTime End, int FreeBays);

public sealed record BookingRequest(Guid VehicleId, Guid ServiceId, DateTime SlotStart, string? Notes, string? PromoCode, Guid? SuggestionId);

public sealed record BookingDto(Guid Id, Guid CustomerId, string CustomerName, Guid VehicleId, string VehicleLabel, Guid ServiceId, string ServiceName,
    DateTime SlotStart, DateTime SlotEnd, string Status, string Source, Guid? JobCardId, Guid? BayId, string? BayName, Guid? MechanicId, string? MechanicName,
    string? Notes, string? PromoCode, string? DeclineReason, DateTime CreatedAt, string? ManagerNote = null);

/// <summary>One page of a list (audit F07). Total = all matching rows.</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public sealed record QueueEstimateDto(Guid JobId, int Position, DateTime? EtaAt, string Status, bool Indicative = true);

public sealed record ProgressDto(string Stage, string Message, int Percent, string ActorRole, DateTime At);

public sealed record JobSummaryDto(Guid Id, string Number, Guid CustomerId, string CustomerName, Guid VehicleId, string VehicleLabel,
    Guid? MechanicId, string? MechanicName, Guid? BayId, string? BayName, string Status, int Priority, int QueuePosition, DateTime? EtaAt,
    int EstimatedMinutes, double ElapsedMinutes, DateTime CreatedAt, DateTime? StartedAt, DateTime? CompletedAt, string? Complaint, string? ManagerNote = null);

public sealed record IssueDto(Guid Id, string Component, string FindingEn, string FindingTa, string RecommendationEn, string RecommendationTa,
    string Severity, IReadOnlyList<string> MediaUrls, int ReportVersion, DateTime ConfirmedAt);

public sealed record RepairItemDto(Guid Id, string Title, string Kind, int Qty, decimal UnitPrice, decimal Amount, int Version, string Status, Guid? LinkedIssueId);

public sealed record AuditDto(string ActorRole, string Action, string? Detail, DateTime At);

public sealed record ProposalDto(Guid Id, Guid JobCardId, string JobNumber, string VehicleLabel, string CustomerName, string Status,
    Guid MechanicId, string? MechanicName, string? MechanicNote, string? ManagerNote, string? CustomerNote,
    DateTime SubmittedAt, DateTime? PublishedAt, DateTime? RespondedAt, DateTime? ReleasedAt,
    decimal Total, decimal ApprovedTotal, IReadOnlyList<RepairItemDto> Items, IReadOnlyList<AuditDto> Audit);

public sealed record ChangeRequestDto(Guid Id, Guid JobCardId, string JobNumber, string Number, IReadOnlyList<string> Changes, string Details,
    string Status, string? ManagerNote, string? MechanicNote, DateTime CreatedAt);

public sealed record InvoiceLineDto(string Description, int Qty, decimal UnitPrice, decimal Amount);

public sealed record InvoiceDto(Guid Id, string Number, Guid JobCardId, Guid CustomerId, decimal Subtotal, decimal Tax, decimal LoyaltyDiscount,
    decimal Total, string Status, string? PaymentMethod, DateTime IssuedAt, DateTime? PaidAt, IReadOnlyList<InvoiceLineDto> Lines);

public sealed record JobDetailDto(JobSummaryDto Job, IReadOnlyList<ProgressDto> Timeline, IReadOnlyList<IssueDto> Issues,
    IReadOnlyList<ProposalDto> Proposals, IReadOnlyList<ChangeRequestDto> ChangeRequests, InvoiceDto? Invoice, QueueEstimateDto Queue);

public sealed record ServiceHistoryDto(Guid JobId, string Number, Guid VehicleId, string VehicleLabel, DateTime Date, IReadOnlyList<string> Work, decimal Total);

// ---- Customer → Manager inputs ----
public sealed record ItemDecision(Guid ItemId, bool Approve, int Version);

public sealed record DecideItemsRequest(IReadOnlyList<ItemDecision> Decisions, string? Note);

public sealed record ChangeRequestCreate(IReadOnlyList<string> Changes, string Details);

// ---- Mechanic → Manager inputs ----
public sealed record ProposalItemInput(string Title, string Kind, int Qty, decimal UnitPrice, Guid? LinkedIssueId, Guid? PartId);

public sealed record SubmitProposalRequest(IReadOnlyList<ProposalItemInput> Items, string? Note);

public sealed record VerifiedIssueInput(string Component, string FindingEn, string FindingTa, string RecommendationEn, string RecommendationTa,
    string Severity, IReadOnlyList<string> MediaRefs);

/// <summary>Action: start | pause | resume | complete | progress.</summary>
public sealed record JobActionRequest(string Action, string? Stage, string? Message, int? Percent);

public sealed record InvitationInfo(Guid Id, string Name, string Phone, DateTime ExpiresAt);
