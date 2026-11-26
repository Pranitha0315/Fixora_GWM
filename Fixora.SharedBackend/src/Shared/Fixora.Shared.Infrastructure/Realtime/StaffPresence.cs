using System.Collections.Concurrent;
using Fixora.Shared.Contracts;

namespace Fixora.Shared.Infrastructure.Realtime;

/// <summary>In-process count of open staff hub connections (one server instance).
/// With several instances behind a load balancer, move this to Redis.</summary>
public sealed class StaffPresence : IStaffPresence
{
    private readonly ConcurrentDictionary<string, Guid> _connections = new();
    private long _lastSeenTicks = DateTime.UtcNow.Ticks;

    public int OnlineCount => _connections.Values.Distinct().Count();
    public DateTime LastSeenUtc => _connections.IsEmpty ? new DateTime(Interlocked.Read(ref _lastSeenTicks), DateTimeKind.Utc) : DateTime.UtcNow;

    public void Connected(string connectionId, Guid userId) => _connections[connectionId] = userId;

    public void Disconnected(string connectionId)
    {
        if (_connections.TryRemove(connectionId, out _))
            Interlocked.Exchange(ref _lastSeenTicks, DateTime.UtcNow.Ticks);
    }
}
