namespace Fixora.Manager.Contracts;

public interface IInvitationGateway
{
    Task<InvitationInfo?> FindValidAsync(string token, CancellationToken ct = default);
    Task MarkAcceptedAsync(Guid invitationId, Guid mechanicId, CancellationToken ct = default);
}
