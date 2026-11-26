using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Fixora.Shared.Infrastructure.Security;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "fixora";
    public string Audience { get; set; } = "fixora-apps";
    /// <summary>At least 32 characters. Override with an environment secret outside development.</summary>
    public string SigningKey { get; set; } = "fixora-dev-signing-key-change-me-0123456789";
    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 14;
}

public sealed class TokenService(SharedDbContext db, IOptions<JwtOptions> options, IClock clock) : ITokenService
{
    private readonly JwtOptions _o = options.Value;

    public async Task<AuthTokens> IssueAsync(Guid userId, string role, string name, CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var accessExpires = now.AddMinutes(_o.AccessTokenMinutes);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = accessExpires,
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("sub", userId.ToString()),
                new Claim("role", role),
                new Claim("name", name),
            }),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_o.SigningKey)), SecurityAlgorithms.HmacSha256),
        };
        var access = new JsonWebTokenHandler().CreateToken(descriptor);

        var refresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var refreshExpires = now.AddDays(_o.RefreshTokenDays);
        db.RefreshTokens.Add(new RefreshTokenRecord
        {
            UserId = userId,
            Role = role,
            Name = name,
            TokenHash = HashToken(refresh),
            ExpiresAt = refreshExpires,
            CreatedAt = now,
        });
        await db.SaveChangesAsync(ct);

        return new AuthTokens(access, accessExpires, refresh, refreshExpires, userId, role, name);
    }

    public async Task<AuthTokens> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        var hash = HashToken(refreshToken);
        var record = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct);
        if (record is null || record.RevokedAt is not null || record.ExpiresAt <= clock.UtcNow)
            throw new UnauthorizedAppException("Session expired. Please log in again.");

        record.RevokedAt = clock.UtcNow; // rotation: every refresh token is single-use
        await db.SaveChangesAsync(ct);
        return await IssueAsync(record.UserId, record.Role, record.Name, ct);
    }

    public async Task RevokeAsync(string refreshToken, CancellationToken ct = default)
    {
        var hash = HashToken(refreshToken);
        var record = await db.RefreshTokens.FirstOrDefaultAsync(r => r.TokenHash == hash, ct);
        if (record is null) return;
        record.RevokedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private static string HashToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
