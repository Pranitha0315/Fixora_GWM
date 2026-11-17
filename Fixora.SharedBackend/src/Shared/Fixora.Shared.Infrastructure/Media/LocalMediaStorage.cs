using System.Security.Cryptography;
using System.Text;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace Fixora.Shared.Infrastructure.Media;

/// <summary>
/// Private media on local disk (App_Data/media). Files are never served by path: clients get
/// an HMAC-signed URL that expires (BR-FP-12, NFR-06). Swap for Azure Blob SAS in production.
/// </summary>
public sealed class LocalMediaStorage(IWebHostEnvironment env, IOptions<JwtOptions> jwt) : IMediaStorage
{
    private readonly string _root = Path.Combine(env.ContentRootPath, "App_Data", "media");
    private readonly byte[] _key = Encoding.UTF8.GetBytes(jwt.Value.SigningKey + ":media");

    public async Task<StoredMedia> SaveAsync(Stream content, string contentType, string fileName, CancellationToken ct = default)
    {
        Directory.CreateDirectory(_root);
        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(ext) || ext.Length > 6) ext = ".bin";
        var mediaRef = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var path = Path.Combine(_root, mediaRef);
        await using (var fs = File.Create(path))
            await content.CopyToAsync(fs, ct);
        await File.WriteAllTextAsync(path + ".type", contentType, ct);
        return new StoredMedia(mediaRef, contentType, new FileInfo(path).Length);
    }

    public string GetSignedUrl(string mediaRef, TimeSpan ttl)
    {
        var exp = DateTimeOffset.UtcNow.Add(ttl).ToUnixTimeSeconds();
        return $"/api/v1/media/{mediaRef}?exp={exp}&sig={Sign(mediaRef, exp)}";
    }

    public bool TryOpen(string mediaRef, long exp, string sig, out string path, out string contentType)
    {
        path = ""; contentType = "application/octet-stream";
        if (mediaRef.Contains('/') || mediaRef.Contains('\\') || mediaRef.Contains("..")) return false;
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return false;
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(Sign(mediaRef, exp)), Encoding.UTF8.GetBytes(sig))) return false;
        path = Path.Combine(_root, mediaRef);
        if (!File.Exists(path)) return false;
        var typeFile = path + ".type";
        if (File.Exists(typeFile)) contentType = File.ReadAllText(typeFile);
        return true;
    }

    private string Sign(string mediaRef, long exp)
    {
        var mac = HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{mediaRef}|{exp}"));
        return Convert.ToHexString(mac).ToLowerInvariant();
    }
}
