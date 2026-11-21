namespace Fixora.Shared.Contracts;

/// <summary>
/// Names of the server → client SignalR events. Every app subscribes to the same names.
/// A realtime event never proves completion: clients re-fetch authoritative state from the API.
/// </summary>
public static class RealtimeEvents
{
    public const string Notification = "notification";
    public const string ApprovalUpdated = "approval.updated";
    public const string ChangeRequestUpdated = "changeRequest.updated";
    public const string JobUpdated = "job.updated";
    public const string QueueUpdated = "queue.updated";
    public const string BookingUpdated = "booking.updated";
    public const string SosUpdated = "sos.updated";
    public const string InventoryUpdated = "inventory.updated";
}

/// <summary>SignalR group naming. Users join their own group and their role group on connect.</summary>
public static class RealtimeGroups
{
    public static string User(Guid id) => $"user:{id}";
    public static string Role(string role) => $"role:{role.ToLowerInvariant()}";
    public static string Job(Guid jobId) => $"job:{jobId}";
    public const string Staff = "role:staff";
}

/// <summary>Who receives a notification: one user, or everyone in a role when UserId is null.
/// Role "Staff" means every manager / owner of the garage.</summary>
public sealed record Recipient(string Role, Guid? UserId)
{
    public const string StaffRole = "Staff";
    public static Recipient User(string role, Guid id) => new(role, id);
    public static Recipient AllStaff() => new(StaffRole, null);
    public static Recipient AllInRole(string role) => new(role, null);
}

/// <summary>Decides who may subscribe to a job's realtime group.</summary>
public interface IRealtimeAccessPolicy
{
    Task<bool> CanJoinJobAsync(Guid userId, string role, Guid jobId, CancellationToken ct = default);
}

/// <summary>Notification types; apps use them for icons and deep links.</summary>
public static class NotificationTypes
{
    public const string ProposalSubmitted = "proposal.submitted";        // mechanic → manager
    public const string ProposalReturned = "proposal.returned";          // manager → mechanic
    public const string ApprovalRequested = "approval.requested";        // manager → customer
    public const string ProposalForwarded = "proposal.forwarded";        // manager → mechanic (info)
    public const string CustomerDecided = "approval.customerDecided";    // customer → manager
    public const string WorkReleased = "approval.released";              // manager → mechanic
    public const string WorkConfirmed = "approval.confirmed";            // manager → customer
    public const string ItemRevised = "approval.itemRevised";            // manager → customer
    public const string ChangeRequested = "change.requested";            // customer → manager
    public const string ChangeForwarded = "change.forwarded";            // manager → mechanic / customer
    public const string ChangeDeclined = "change.declined";              // manager → customer
    public const string ChangeAcknowledged = "change.acknowledged";      // mechanic → manager / customer
    public const string BookingRequested = "booking.requested";
    public const string BookingConfirmed = "booking.confirmed";
    public const string BookingDeclined = "booking.declined";
    public const string BookingCancelled = "booking.cancelled";
    public const string JobAssigned = "job.assigned";
    public const string JobProgress = "job.progress";
    public const string JobCompleted = "job.completed";
    public const string QueueEtaChanged = "queue.etaChanged";
    public const string SosRaised = "sos.raised";
    public const string SosStatus = "sos.status";
    public const string SosDispatched = "sos.dispatched";
    public const string MaintenanceSuggested = "drivesense.suggestion";
    public const string InvoiceIssued = "invoice.issued";
    public const string PaymentRecorded = "invoice.paid";
    public const string LowStock = "inventory.lowStock";
    public const string AdvisorBriefing = "advisor.briefing";
}

public sealed record NotificationMessage(
    string Type,
    string Title,
    string Body,
    string? EntityType = null,
    Guid? EntityId = null,
    Guid? JobId = null,
    IDictionary<string, string>? Data = null);

public sealed record NotificationDto(
    Guid Id,
    string Type,
    string Title,
    string Body,
    string? EntityType,
    Guid? EntityId,
    Guid? JobId,
    IDictionary<string, string>? Data,
    bool Read,
    DateTime CreatedAt);

/// <summary>
/// Persists in-app notifications, pushes them over SignalR and (when configured) FCM.
/// This is the single path every cross-role hand-off goes through.
/// </summary>
public interface INotificationService
{
    Task NotifyAsync(NotificationMessage message, IEnumerable<Recipient> recipients, CancellationToken ct = default);

    /// <summary>Push a state-change event (no persisted notification) to groups.</summary>
    Task PublishAsync(string eventName, object payload, IEnumerable<string> groups, CancellationToken ct = default);
}
