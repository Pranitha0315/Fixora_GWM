namespace Fixora.Customer.Contracts;

public sealed record CustomerSummary(Guid Id, string Name, string Email, string Phone, string PreferredLanguage);

public sealed record VehicleSummary(Guid Id, Guid CustomerId, string RegistrationNo, string Make, string Model, int Year, string Type, bool DriveSenseOptIn)
{
    public string Label => $"{Make} {Model} ({RegistrationNo})";
}

/// <summary>DriveSense hint card for the mechanic job view (BR-DS-09). Only for opted-in vehicles.</summary>
public sealed record DriveSenseHintDto(Guid VehicleId, double RoughRoadPct, int DriveScore, int PotholeHits, IReadOnlyList<string> TopFlags, DateOnly WeekStart);

public sealed record SosHistoryDto(string Status, string ActorRole, DateTime At, string? Note);

public sealed record SosDto(Guid Id, Guid CustomerId, string CustomerName, string CustomerPhone, Guid? VehicleId, string? VehicleLabel,
    double? Lat, double? Lng, string Category, string? Note, string Status, DateTime ReceivedAt, Guid? AssignedMechanicId,
    string? DriveSenseContext, IReadOnlyList<SosHistoryDto> History);

public sealed record LoyaltyRedemption(decimal DiscountRupees, int PointsUsed);

/// <summary>
/// One coarse map cell for the manager's road-stress heatmap (FX13-D08-NAR-2). Aggregated only:
/// no customer, vehicle or trip ids, and cells with fewer than HeatmapMinVehicles vehicles are hidden.
/// </summary>
public sealed record RoadStressCellDto(string Geohash, double Lat, double Lng, int Vehicles, int Trips,
    double RoughRoadPct, double PotholesPer100Km, string Level);

/// <summary>Read-only customer facts other contexts may use (names, vehicles, hints, loyalty).</summary>
public interface ICustomerDirectory
{
    Task<CustomerSummary?> GetCustomerAsync(Guid customerId, CancellationToken ct = default);
    Task<IReadOnlyDictionary<Guid, CustomerSummary>> GetCustomersAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task<VehicleSummary?> GetVehicleAsync(Guid vehicleId, CancellationToken ct = default);
    Task<DriveSenseHintDto?> GetDriveSenseHintAsync(Guid vehicleId, CancellationToken ct = default);
    Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(CancellationToken ct = default);
    Task MarkSuggestionBookedAsync(Guid suggestionId, Guid appointmentId, CancellationToken ct = default);
    /// <summary>Redeems garage-only loyalty points against an invoice, capped by the owner's settings.</summary>
    Task<LoyaltyRedemption> RedeemForInvoiceAsync(Guid customerId, decimal invoiceSubtotal, decimal percent, decimal cap, string invoiceNumber, CancellationToken ct = default);
    Task AwardSpendPointsAsync(Guid customerId, decimal paidAmount, string invoiceNumber, CancellationToken ct = default);
    /// <summary>Aggregated road stress per coarse geohash cell over the last <paramref name="days"/> days (privacy-safe).</summary>
    Task<IReadOnlyList<RoadStressCellDto>> GetRoadStressAsync(int days, CancellationToken ct = default);
}

/// <summary>SOS is customer-owned; staff and mechanics change its status only through this contract.</summary>
public interface ISosOperations
{
    Task<IReadOnlyList<SosDto>> ListAsync(bool openOnly, CancellationToken ct = default);
    Task<IReadOnlyList<SosDto>> ListForMechanicAsync(Guid mechanicId, CancellationToken ct = default);
    Task<SosDto> AcknowledgeAsync(Guid sosId, Guid staffId, string? note, CancellationToken ct = default);
    Task<SosDto> DispatchAsync(Guid sosId, Guid staffId, Guid mechanicId, string? note, CancellationToken ct = default);
    /// <summary>OnSite / Resolved / Cancelled by staff or the assigned mechanic.</summary>
    Task<SosDto> UpdateStatusAsync(Guid sosId, string actorRole, Guid actorId, string status, string? note, CancellationToken ct = default);
}
