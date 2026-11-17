using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Media;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Realtime;
using Fixora.Shared.Infrastructure.Security;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Shared.Infrastructure.Api;

/// <summary>In-app notification inbox for every role (customer, mechanic, manager).</summary>
[ApiController]
[Authorize]
[Route("api/v1/notifications")]
public sealed class NotificationsController(SharedDbContext db, ICurrentUser user) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<NotificationDto>> List([FromQuery] bool unreadOnly = false, [FromQuery] int take = 50, CancellationToken ct = default)
    {
        var q = Mine();
        if (unreadOnly) q = q.Where(n => !n.Read);
        var rows = await q.OrderByDescending(n => n.CreatedAt).Take(Math.Clamp(take, 1, 200)).ToListAsync(ct);
        return rows.Select(NotificationService.ToDto).ToList();
    }

    [HttpGet("unread-count")]
    public async Task<object> UnreadCount(CancellationToken ct)
        => new { count = await Mine().CountAsync(n => !n.Read, ct) };

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        var n = await Mine().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Notification");
        n.Read = true;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        var rows = await Mine().Where(n => !n.Read).ToListAsync(ct);
        rows.ForEach(n => n.Read = true);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private IQueryable<NotificationRecord> Mine()
    {
        var id = user.UserId;
        var role = user.Role;
        var staff = Roles.IsStaff(role);
        return db.Notifications.Where(n =>
            n.RecipientId == id ||
            (n.RecipientId == null && (n.RecipientRole == role || (staff && n.RecipientRole == Recipient.StaffRole))));
    }
}

public sealed record RegisterDeviceRequest(string Token, string Platform);

[ApiController]
[Authorize]
[Route("api/v1/devices")]
public sealed class DevicesController(SharedDbContext db, ICurrentUser user, IClock clock) : ControllerBase
{
    /// <summary>Registers an FCM token for push notifications.</summary>
    [HttpPost]
    public async Task<IActionResult> Register(RegisterDeviceRequest req, CancellationToken ct)
    {
        Guard.Against(string.IsNullOrWhiteSpace(req.Token), "Token is required.");
        var existing = await db.DeviceTokens.FirstOrDefaultAsync(t => t.Token == req.Token, ct);
        if (existing is null)
            db.DeviceTokens.Add(new DeviceToken { Token = req.Token, UserId = user.UserId, Role = user.Role, Platform = req.Platform, UpdatedAt = clock.UtcNow });
        else
        {
            existing.UserId = user.UserId;
            existing.Role = user.Role;
            existing.UpdatedAt = clock.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/v1/media")]
public sealed class MediaController(IMediaStorage storage) : ControllerBase
{
    /// <summary>Streams private media only with a valid, unexpired signature.</summary>
    [HttpGet("{mediaRef}")]
    [AllowAnonymous]
    public IActionResult Get(string mediaRef, [FromQuery] long exp, [FromQuery] string sig)
    {
        if (storage is not LocalMediaStorage local || !local.TryOpen(mediaRef, exp, sig ?? "", out var path, out var type))
            return NotFound();
        return PhysicalFile(path, type);
    }
}

public sealed record RefreshRequest(string RefreshToken);

[ApiController]
[Route("api/v1/auth")]
public sealed class SessionController(ITokenService tokens) : ControllerBase
{
    /// <summary>Rotates a refresh token for any role.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public Task<AuthTokens> Refresh(RefreshRequest req, CancellationToken ct) => tokens.RefreshAsync(req.RefreshToken, ct);

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(RefreshRequest req, CancellationToken ct)
    {
        await tokens.RevokeAsync(req.RefreshToken, ct);
        return NoContent();
    }
}
