namespace Fixora.Manager.Contracts;

public sealed record InvitationInfo(Guid Id, string Name, string Phone, DateTime ExpiresAt);
