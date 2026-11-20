namespace Fixora.Customer.Contracts;

public sealed record CustomerSummary(Guid Id, string Name, string Email, string Phone, string PreferredLanguage);

public sealed record VehicleSummary(Guid Id, Guid CustomerId, string RegistrationNo, string Make, string Model, int Year, string Type, bool DriveSenseOptIn)
{
    public string Label => $"{Make} {Model} ({RegistrationNo})";
}

/// <summary>DriveSense hint card for the mechanic job view (BR-DS-09). Only for opted-in vehicles.</summary>
public sealed record DriveSenseHintDto(Guid VehicleId, double RoughRoadPct, int DriveScore, int PotholeHits, IReadOnlyList<string> TopFlags, DateOnly WeekStart);

/// <summary>Read-only customer facts other contexts may use (names, vehicles, hints, loyalty).</summary>
public interface ICustomerDirectory
{
    Task<CustomerSummary?> GetCustomerAsync(Guid customerId, CancellationToken ct = default);
    Task<IReadOnlyDictionary<Guid, CustomerSummary>> GetCustomersAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
    Task<VehicleSummary?> GetVehicleAsync(Guid vehicleId, CancellationToken ct = default);
    Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(CancellationToken ct = default);
}
