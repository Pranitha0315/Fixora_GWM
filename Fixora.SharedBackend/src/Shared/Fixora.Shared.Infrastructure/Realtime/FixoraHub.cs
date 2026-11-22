using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Fixora.Shared.Infrastructure.Realtime;

/// <summary>
/// One realtime hub for customer app, Fixora Rev and the manager web: /hubs/fixora.
/// On connect a caller joins user:{id} and role:{role}; managers/owners also join role:staff.
/// Clients call JoinJob(jobId) to follow a job card (access is checked per role).
/// </summary>
[Authorize]
public sealed class FixoraHub(IRealtimeAccessPolicy accessPolicy, StaffPresence presence) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var (userId, role) = Caller();
        if (userId != Guid.Empty)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.User(userId));
            await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Role(role));
            if (Roles.IsStaff(role))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Staff);
                presence.Connected(Context.ConnectionId, userId);   // manager is here → Manager mode
            }
        }
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        presence.Disconnected(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    public async Task<bool> JoinJob(Guid jobId)
    {
        var (userId, role) = Caller();
        if (!await accessPolicy.CanJoinJobAsync(userId, role, jobId, Context.ConnectionAborted))
            return false;
        await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Job(jobId));
        return true;
    }

    public Task LeaveJob(Guid jobId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, RealtimeGroups.Job(jobId));

    public string Ping() => "pong";

    private (Guid userId, string role) Caller()
    {
        var sub = Context.User?.FindFirst("sub")?.Value;
        var role = Context.User?.FindFirst("role")?.Value ?? "";
        return (Guid.TryParse(sub, out var id) ? id : Guid.Empty, role);
    }
}
