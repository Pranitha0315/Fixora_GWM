namespace Fixora.Manager.Contracts;

/// <summary>
/// The "bookings / approvals gateway" (architecture diagram 04): the only way the Customer
/// application reaches manager-owned records. Every method enforces customer ownership.
/// </summary>
public interface IWorkshopGateway
{
    Task<GarageDto> GetGarageAsync(CancellationToken ct = default);
    Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken ct = default);
}

public interface IInvitationGateway
{
    Task<InvitationInfo?> FindValidAsync(string token, CancellationToken ct = default);
    Task MarkAcceptedAsync(Guid invitationId, Guid mechanicId, CancellationToken ct = default);
}
