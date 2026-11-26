using System.Security.Cryptography;
using Fixora.Shared.Contracts;

namespace Fixora.Shared.Infrastructure.Security;

/// <summary>PBKDF2-SHA256 hashing for passwords, PINs and OTP codes. Format: v1.iterations.salt.hash</summary>
public sealed class PasswordService : IPasswordService
{
    private const int Iterations = 100_000;

    public string Hash(string secret)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(secret, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool Verify(string hash, string secret)
    {
        var parts = hash.Split('.');
        if (parts.Length != 4 || parts[0] != "v1") return false;
        var iterations = int.Parse(parts[1]);
        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(secret, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
