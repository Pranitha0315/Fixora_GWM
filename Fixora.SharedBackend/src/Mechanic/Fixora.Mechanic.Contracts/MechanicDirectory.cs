namespace Fixora.Mechanic.Contracts;

public sealed record MechanicSummary(Guid Id, string Name, string Phone, string EmployeeCode, bool Active, bool OnDuty);

/// <summary>Read-only mechanic facts used by the Manager context (names, duty roster).</summary>
public interface IMechanicDirectory
{
    Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default);
    Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default);
}
