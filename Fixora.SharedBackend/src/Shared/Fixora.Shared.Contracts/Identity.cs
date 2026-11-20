namespace Fixora.Shared.Contracts;

/// <summary>The authenticated caller, read from JWT claims.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid UserId { get; }
    string Role { get; }
    string Name { get; }
}
