namespace Fixora.Shared.Contracts;

/// <summary>The authenticated caller, read from JWT claims.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid UserId { get; }
    string Role { get; }
    string Name { get; }
}

public sealed record AuthTokens(string AccessToken, DateTime AccessTokenExpiresAt, string RefreshToken, DateTime RefreshTokenExpiresAt, Guid UserId, string Role, string Name);

public interface ITokenService
{
    /// <summary>Creates a short-lived JWT plus a rotating refresh token (stored hashed).</summary>
    Task<AuthTokens> IssueAsync(Guid userId, string role, string name, CancellationToken ct = default);

    /// <summary>Rotates a refresh token. Throws 401 when it is unknown, expired or revoked.</summary>
    Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken ct = default);

    Task RevokeAsync(string refreshToken, CancellationToken ct = default);
}

public interface IPasswordService
{
    string Hash(string secret);
    bool Verify(string hash, string secret);
}
