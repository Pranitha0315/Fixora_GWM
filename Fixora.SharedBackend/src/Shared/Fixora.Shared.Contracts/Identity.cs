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

/// <summary>
/// Runs work inside one database transaction when the provider is relational.
/// Used when Manager and Mechanic DbContexts must commit or roll back together.
/// </summary>
public interface IFixoraTransaction
{
    Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default);
    Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken ct = default);
}

public sealed record StoredMedia(string MediaRef, string ContentType, long Size);

/// <summary>Private media storage. Callers only ever receive short-lived signed URLs.</summary>
public interface IMediaStorage
{
    Task<StoredMedia> SaveAsync(Stream content, string contentType, string fileName, CancellationToken ct = default);
    string GetSignedUrl(string mediaRef, TimeSpan ttl);
}
