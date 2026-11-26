using System.Text.Json;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Fixora.Shared.Infrastructure.Realtime;

/// <summary>Sends a push notification to a device (FCM in production).</summary>
public interface IPushSender
{
    Task SendAsync(IReadOnlyCollection<string> deviceTokens, NotificationDto notification, CancellationToken ct = default);
}

/// <summary>Development push sender: logs instead of calling FCM. Swap for an FCM HTTP v1 sender.</summary>
public sealed class LoggingPushSender(ILogger<LoggingPushSender> logger) : IPushSender
{
    public Task SendAsync(IReadOnlyCollection<string> deviceTokens, NotificationDto notification, CancellationToken ct = default)
    {
        if (deviceTokens.Count > 0)
            logger.LogInformation("Push {Type} to {Count} device(s)", notification.Type, deviceTokens.Count);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Persist → SignalR → push, in that order, so the in-app inbox is the source of truth and
/// realtime delivery is best effort. A failed push never fails the business action.
/// </summary>
public sealed class NotificationService(
    SharedDbContext db,
    IHubContext<FixoraHub> hub,
    IPushSender push,
    IClock clock,
    ILogger<NotificationService> logger) : INotificationService
{
    public async Task NotifyAsync(NotificationMessage message, IEnumerable<Recipient> recipients, CancellationToken ct = default)
    {
        var list = recipients.Distinct().ToList();
        if (list.Count == 0) return;

        var dataJson = message.Data is null ? null : JsonSerializer.Serialize(message.Data);
        var records = list.Select(r => new NotificationRecord
        {
            RecipientRole = r.Role,
            RecipientId = r.UserId,
            Type = message.Type,
            Title = message.Title,
            Body = message.Body,
            EntityType = message.EntityType,
            EntityId = message.EntityId,
            JobId = message.JobId,
            DataJson = dataJson,
            CreatedAt = clock.UtcNow,
        }).ToList();

        db.Notifications.AddRange(records);
        await db.SaveChangesAsync(ct);

        foreach (var (recipient, record) in list.Zip(records))
        {
            var dto = ToDto(record);
            var group = GroupFor(recipient);
            try
            {
                await hub.Clients.Group(group).SendAsync(RealtimeEvents.Notification, dto, ct);

                var tokens = await TokensFor(recipient, ct);
                await push.SendAsync(tokens, dto, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Realtime delivery failed for notification {Id}", record.Id);
            }
        }
    }

    public async Task PublishAsync(string eventName, object payload, IEnumerable<string> groups, CancellationToken ct = default)
    {
        try
        {
            await hub.Clients.Groups(groups.Distinct().ToList()).SendAsync(eventName, payload, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Realtime publish of {Event} failed", eventName);
        }
    }

    public static string GroupFor(Recipient r) => r.UserId is { } id
        ? RealtimeGroups.User(id)
        : r.Role == Recipient.StaffRole ? RealtimeGroups.Staff : RealtimeGroups.Role(r.Role);

    private async Task<IReadOnlyCollection<string>> TokensFor(Recipient r, CancellationToken ct)
    {
        var q = db.DeviceTokens.AsNoTracking();
        if (r.UserId is { } id) q = q.Where(t => t.UserId == id);
        else if (r.Role == Recipient.StaffRole) q = q.Where(t => t.Role == Roles.Manager || t.Role == Roles.Owner);
        else q = q.Where(t => t.Role == r.Role);
        return await q.Select(t => t.Token).ToListAsync(ct);
    }

    public static NotificationDto ToDto(NotificationRecord r) => new(
        r.Id, r.Type, r.Title, r.Body, r.EntityType, r.EntityId, r.JobId,
        r.DataJson is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(r.DataJson),
        r.Read, r.CreatedAt);
}
