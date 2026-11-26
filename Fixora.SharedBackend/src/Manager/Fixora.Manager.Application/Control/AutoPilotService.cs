using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Approvals;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Fixora.Manager.Application.Control;

public sealed record AutoActionDto(Guid Id, DateTime At, string Kind, string Title, string Detail, Guid? EntityId, Guid? JobCardId, bool Held, bool Seen);

/// <param name="Mode">What the manager chose: Manager or Auto.</param>
/// <param name="EffectiveMode">What is running now: Auto also when Manager mode is chosen but nobody is online.</param>
public sealed record ControlStatusDto(
    string Mode, string EffectiveMode, string Reason,
    int ManagersOnline, DateTime ManagerLastSeenAt, DateTime? AutoSince, DateTime? AutoTakesOverAt,
    bool AutoWhenAway, int AwayMinutes, decimal HoldAboveRupees, bool AutoBookings, bool AutoSos,
    int UnseenActions, int HeldWaiting, IReadOnlyList<AutoActionDto> Recent);

public sealed record ControlUpdateRequest(string Mode, bool AutoWhenAway, int AwayMinutes, decimal HoldAboveRupees, bool AutoBookings, bool AutoSos);

/// <summary>Process-wide memory of the last effective mode, so a switch is announced once.</summary>
public sealed class AutoPilotState
{
    public bool? LastAuto { get; set; }
    public DateTime? AutoSince { get; set; }
    public readonly SemaphoreSlim Gate = new(1, 1);
}

/// <summary>
/// Manager mode and Auto mode.
/// <para>Manager mode: every hop of the approval route waits for a manager (the BRD flow).</para>
/// <para>Auto mode (chosen, or because no manager has the dashboard open for <c>AwayMinutes</c>):
/// mechanic proposals go straight to the customer, customer decisions are released to the mechanic,
/// customer change requests reach the mechanic, booking requests are confirmed into a free bay and
/// SOS calls are acknowledged and dispatched to an on-duty mechanic. Customers still approve every
/// repair item themselves; Auto mode never approves on the customer's behalf.</para>
/// Everything Auto mode does, or leaves for the manager, is logged for review.
/// </summary>
public sealed class AutoPilotService(
    IControlDb control,
    IManagerDb db,
    IStaffPresence presence,
    AutoPilotState state,
    ApprovalWorkflowService approvals,
    ChangeRequestService changes,
    BookingService bookings,
    ISosOperations sos,
    MechanicRosterService roster,
    INotificationService notifier,
    IClock clock,
    ILogger<AutoPilotService> logger)
{
    private static readonly Guid Actor = AutoPilot.ActorId;

    // ------------------------------------------------------------------ status

    public async Task<ControlSettings> SettingsAsync(CancellationToken ct = default)
    {
        var s = await control.ControlSettings.FirstOrDefaultAsync(ct);
        if (s is not null) return s;
        s = new ControlSettings { UpdatedAt = clock.UtcNow };
        control.ControlSettings.Add(s);
        await control.SaveChangesAsync(ct);
        return s;
    }

    /// <summary>(auto?, reason, when Auto would take over in Manager mode).</summary>
    public (bool Auto, string Reason, DateTime? TakesOverAt) Effective(ControlSettings s)
    {
        if (s.Mode == ControlMode.Auto) return (true, "Auto mode switched on by a manager", null);
        if (presence.OnlineCount > 0) return (false, "A manager is online", null);
        if (!s.AutoWhenAway) return (false, "Manager mode · waiting for a manager", null);
        var takeOver = presence.LastSeenUtc.AddMinutes(Math.Max(1, s.AwayMinutes));
        return clock.UtcNow >= takeOver
            ? (true, $"No manager online for {s.AwayMinutes} min", takeOver)
            : (false, "No manager online · Auto mode starts soon", takeOver);
    }

    public async Task<ControlStatusDto> StatusAsync(CancellationToken ct = default)
    {
        var s = await SettingsAsync(ct);
        var (auto, reason, takeOver) = Effective(s);
        var recent = await control.AutoActions.AsNoTracking().OrderByDescending(a => a.At).Take(30).ToListAsync(ct);
        var unseen = await control.AutoActions.CountAsync(a => !a.Seen, ct);
        var held = await HeldWaitingAsync(ct);
        return new ControlStatusDto(
            s.Mode.ToString(), auto ? "Auto" : "Manager", reason,
            presence.OnlineCount, presence.LastSeenUtc, auto ? state.AutoSince ?? clock.UtcNow : null, auto ? null : takeOver,
            s.AutoWhenAway, s.AwayMinutes, s.HoldAboveRupees, s.AutoBookings, s.AutoSos,
            unseen, held,
            recent.Select(a => new AutoActionDto(a.Id, a.At, a.Kind, a.Title, a.Detail, a.EntityId, a.JobCardId, a.Held, a.Seen)).ToList());
    }

    public async Task<ControlStatusDto> UpdateAsync(Guid staffId, ControlUpdateRequest req, CancellationToken ct = default)
    {
        Guard.Against(!Enum.TryParse<ControlMode>(req.Mode, true, out var mode), "Mode must be Manager or Auto.");
        Guard.Against(req.AwayMinutes is < 1 or > 240, "Away time must be between 1 and 240 minutes.");
        Guard.Against(req.HoldAboveRupees < 0, "The hold limit cannot be negative.");
        var s = await SettingsAsync(ct);
        s.Mode = mode;
        s.AutoWhenAway = req.AutoWhenAway;
        s.AwayMinutes = req.AwayMinutes;
        s.HoldAboveRupees = req.HoldAboveRupees;
        s.AutoBookings = req.AutoBookings;
        s.AutoSos = req.AutoSos;
        s.UpdatedBy = staffId;
        s.UpdatedAt = clock.UtcNow;
        await control.SaveChangesAsync(ct);
        await TickAsync(ct);   // apply at once: switching to Auto clears the backlog now
        return await StatusAsync(ct);
    }

    public async Task MarkSeenAsync(CancellationToken ct = default)
    {
        var rows = await control.AutoActions.Where(a => !a.Seen).ToListAsync(ct);
        foreach (var r in rows) r.Seen = true;
        await control.SaveChangesAsync(ct);
        await PublishAsync(ct);
    }

    // ------------------------------------------------------------------ the loop

    /// <summary>Called every few seconds by the worker and right after a settings change.</summary>
    public async Task<int> TickAsync(CancellationToken ct = default)
    {
        if (!await state.Gate.WaitAsync(0, ct)) return 0;   // a tick is already running
        try
        {
            var s = await SettingsAsync(ct);
            var (auto, reason, _) = Effective(s);
            if (state.LastAuto != auto)
            {
                var first = state.LastAuto is null;
                state.LastAuto = auto;
                state.AutoSince = auto ? clock.UtcNow : null;
                if (!first || auto) await AnnounceAsync(auto, reason, ct);
            }
            if (!auto) return 0;

            var done = 0;
            done += await ForwardProposalsAsync(s, ct);
            done += await ReleaseDecisionsAsync(ct);
            done += await ForwardChangeRequestsAsync(ct);
            if (s.AutoBookings) done += await ConfirmBookingsAsync(ct);
            if (s.AutoSos) done += await DispatchSosAsync(ct);
            if (done > 0) await PublishAsync(ct);
            return done;
        }
        finally
        {
            state.Gate.Release();
        }
    }

    private async Task AnnounceAsync(bool auto, string reason, CancellationToken ct)
    {
        string body;
        if (auto)
        {
            body = $"{reason}. Proposals go to customers, decisions go to mechanics, bookings and SOS are handled automatically.";
        }
        else
        {
            var since = clock.UtcNow.AddHours(-24);
            var handled = await control.AutoActions.CountAsync(a => !a.Seen && !a.Held && a.At >= since, ct);
            var held = await HeldWaitingAsync(ct);
            body = handled == 0 && held == 0
                ? "Welcome back. Nothing happened while Auto mode was on."
                : $"Welcome back. Auto mode handled {handled} item(s)" + (held > 0 ? $"; {held} wait for you." : ".");
        }
        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.ControlModeChanged,
                auto ? "Auto mode is on" : "Manager mode is back",
                body, "control", null, null, new Dictionary<string, string> { ["route"] = "dashboard" }),
            new[] { Recipient.AllStaff() }, ct);
        await PublishAsync(ct);
        logger.LogInformation("Control mode → {Mode}: {Reason}", auto ? "Auto" : "Manager", reason);
    }

    // ------------------------------------------------------------------ 1. mechanic proposal → customer

    private async Task<int> ForwardProposalsAsync(ControlSettings s, CancellationToken ct)
    {
        var pending = await db.Proposals.AsNoTracking().Include(p => p.Items)
            .Where(p => p.Status == ProposalStatus.PendingManagerReview).OrderBy(p => p.SubmittedAt).Take(20).ToListAsync(ct);
        var n = 0;
        foreach (var p in pending)
        {
            var total = p.Items.Sum(i => i.Qty * i.UnitPrice);
            var job = await db.JobCards.AsNoTracking().FirstAsync(j => j.Id == p.JobCardId, ct);
            if (s.HoldAboveRupees > 0 && total > s.HoldAboveRupees)
            {
                await HoldOnceAsync(p.Id, job.Id, $"Proposal held · {job.Number}",
                    $"Rs {total:N0} is above the Auto mode limit of Rs {s.HoldAboveRupees:N0}. Review it in Approvals.", ct);
                continue;
            }
            if (p.Items.Any(i => i.UnitPrice <= 0))
            {
                await HoldOnceAsync(p.Id, job.Id, $"Proposal held · {job.Number}", "An item has no price yet. Set the price in Approvals.", ct);
                continue;
            }
            n += await TryAsync("proposal.forwarded", p.Id, job.Id,
                $"Sent to customer · {job.Number}",
                $"{p.Items.Count} item(s) · Rs {total:N0} · {job.VehicleLabel}. The customer approves item by item.",
                () => approvals.ForwardToCustomerAsync(Actor, p.Id, "Sent automatically (Auto mode)", ct, auto: true), ct);
        }
        return n;
    }

    // ------------------------------------------------------------------ 2. customer decision → mechanic

    private async Task<int> ReleaseDecisionsAsync(CancellationToken ct)
    {
        var ready = await db.Proposals.AsNoTracking().Include(p => p.Items)
            .Where(p => p.Status == ProposalStatus.CustomerResponded).OrderBy(p => p.SubmittedAt).Take(20).ToListAsync(ct);
        var n = 0;
        foreach (var p in ready)
        {
            var job = await db.JobCards.AsNoTracking().FirstAsync(j => j.Id == p.JobCardId, ct);
            var approved = p.Items.Where(i => i.Status == RepairItemStatus.Approved).ToList();
            n += await TryAsync("proposal.released", p.Id, job.Id,
                $"Released to mechanic · {job.Number}",
                approved.Count > 0
                    ? $"Customer approved {approved.Count} of {p.Items.Count} item(s) · Rs {approved.Sum(i => i.Qty * i.UnitPrice):N0}."
                    : "Customer declined the extra items; the booked service continues.",
                () => approvals.ReleaseAsync(Actor, p.Id, "Released automatically (Auto mode)", ct, auto: true), ct);
        }
        return n;
    }

    // ------------------------------------------------------------------ 3. customer change request → mechanic

    private async Task<int> ForwardChangeRequestsAsync(CancellationToken ct)
    {
        var pending = await db.ChangeRequests.AsNoTracking()
            .Where(c => c.Status == ChangeRequestStatus.PendingManagerReview).OrderBy(c => c.CreatedAt).Take(20).ToListAsync(ct);
        var n = 0;
        foreach (var c in pending)
        {
            var job = await db.JobCards.AsNoTracking().FirstAsync(j => j.Id == c.JobCardId, ct);
            if (job.MechanicId is null)
            {
                await HoldOnceAsync(c.Id, job.Id, $"Change request held · {job.Number}", "No mechanic is assigned to this job yet.", ct);
                continue;
            }
            n += await TryAsync("change.forwarded", c.Id, job.Id,
                $"Change sent to mechanic · {c.Number}",
                $"{job.Number}: {string.Join(", ", c.Changes)}",
                () => changes.ForwardAsync(Actor, c.Id, null, ct, auto: true), ct);
        }
        return n;
    }

    // ------------------------------------------------------------------ 4. booking request → confirmed

    private async Task<int> ConfirmBookingsAsync(CancellationToken ct)
    {
        var now = clock.UtcNow;
        var requested = await db.Appointments.AsNoTracking()
            .Where(a => a.Status == AppointmentStatus.Requested && a.SlotEnd > now).OrderBy(a => a.SlotStart).Take(20).ToListAsync(ct);
        if (requested.Count == 0) return 0;

        var bays = await db.Bays.AsNoTracking().Where(b => b.Active).OrderBy(b => b.Name).ToListAsync(ct);
        var mechanics = (await roster.ListAsync(ct)).OrderByDescending(m => m.OnDuty).ThenBy(m => m.ActiveJobs).ToList();
        var n = 0;
        foreach (var a in requested)
        {
            var busy = await db.Appointments.AsNoTracking()
                .Where(x => x.Id != a.Id && (x.Status == AppointmentStatus.Confirmed || x.Status == AppointmentStatus.CheckedIn)
                            && x.SlotStart < a.SlotEnd && a.SlotStart < x.SlotEnd)
                .Select(x => new { x.BayId, x.MechanicId }).ToListAsync(ct);
            var bay = bays.FirstOrDefault(b => busy.All(x => x.BayId != b.Id));
            var mech = mechanics.FirstOrDefault(m => busy.All(x => x.MechanicId != m.Id));
            if (bay is null || mech is null)
            {
                await HoldOnceAsync(a.Id, null, $"Booking held · {a.CustomerName}",
                    $"{a.ServiceName}: no free {(bay is null ? "bay" : "mechanic")} for this slot. Confirm or decline it in Bookings.", ct);
                continue;
            }
            n += await TryAsync("booking.confirmed", a.Id, null,
                $"Booking confirmed · {a.CustomerName}",
                $"{a.VehicleLabel} · {a.ServiceName} · {LocalTime.Format(a.SlotStart)} · {bay.Name} · {mech.Name}",
                () => bookings.ConfirmAsync(Actor, a.Id, new ConfirmBookingRequest(bay.Id, mech.Id, "Confirmed automatically (Auto mode)"), ct), ct);
        }
        return n;
    }

    // ------------------------------------------------------------------ 5. SOS → acknowledged + dispatched

    private async Task<int> DispatchSosAsync(CancellationToken ct)
    {
        var open = await sos.ListAsync(openOnly: true, ct);
        var waiting = open.Where(x => x.AssignedMechanicId is null && (x.Status == "Received" || x.Status == "Acknowledged")).ToList();
        if (waiting.Count == 0) return 0;

        var busyOnSos = open.Where(x => x.AssignedMechanicId is not null).Select(x => x.AssignedMechanicId!.Value).ToHashSet();
        var free = (await roster.ListAsync(ct)).Where(m => m.OnDuty && !busyOnSos.Contains(m.Id)).OrderBy(m => m.ActiveJobs).ToList();
        var n = 0;
        foreach (var x in waiting.OrderBy(x => x.ReceivedAt))
        {
            if (x.Status == "Received")
                await sos.AcknowledgeAsync(x.Id, Actor, "The garage received your SOS. Help is being arranged now.", ct);
            var mech = free.FirstOrDefault();
            if (mech is null)
            {
                await HoldOnceAsync(x.Id, null, $"SOS waiting · {x.CustomerName}",
                    $"No mechanic is on duty. Call {x.CustomerPhone} and dispatch someone from Roadside SOS.", ct);
                continue;
            }
            free.Remove(mech);
            n += await TryAsync("sos.dispatched", x.Id, null,
                $"SOS dispatched · {x.CustomerName}",
                $"{x.Category} · {mech.Name} is on the way" + (x.VehicleLabel is null ? "" : $" · {x.VehicleLabel}"),
                () => sos.DispatchAsync(x.Id, Actor, mech.Id, null, ct), ct);
        }
        return n;
    }

    // ------------------------------------------------------------------ helpers

    private async Task<int> TryAsync<T>(string kind, Guid entityId, Guid? jobId, string title, string detail, Func<Task<T>> act, CancellationToken ct)
    {
        try
        {
            await act();
            await LogAsync(kind, entityId, jobId, title, detail, held: false, ct);
            return 1;
        }
        catch (AppException ex)
        {
            // The state moved on (a manager or the customer acted first): nothing to do.
            logger.LogDebug(ex, "Auto mode skipped {Kind} {Id}", kind, entityId);
            return 0;
        }
    }

    private async Task HoldOnceAsync(Guid entityId, Guid? jobId, string title, string detail, CancellationToken ct)
    {
        if (await control.AutoActions.AnyAsync(a => a.EntityId == entityId && a.Kind == "held", ct)) return;
        await LogAsync("held", entityId, jobId, title, detail, held: true, ct);
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.ControlModeChanged, title, detail, "control", entityId, jobId),
            new[] { Recipient.AllStaff() }, ct);
        await PublishAsync(ct);
    }

    private async Task LogAsync(string kind, Guid entityId, Guid? jobId, string title, string detail, bool held, CancellationToken ct)
    {
        control.AutoActions.Add(new AutoActionLog
        {
            At = clock.UtcNow,
            Kind = kind,
            EntityId = entityId,
            JobCardId = jobId,
            Title = title,
            Detail = detail,
            Held = held,
        });
        await control.SaveChangesAsync(ct);
    }

    /// <summary>Held items whose entity is still waiting for a manager.</summary>
    private async Task<int> HeldWaitingAsync(CancellationToken ct)
    {
        var held = await control.AutoActions.AsNoTracking().Where(a => a.Kind == "held" && a.EntityId != null)
            .Select(a => a.EntityId!.Value).ToListAsync(ct);
        if (held.Count == 0) return 0;
        var proposals = await db.Proposals.CountAsync(p => held.Contains(p.Id) && p.Status == ProposalStatus.PendingManagerReview, ct);
        var crs = await db.ChangeRequests.CountAsync(c => held.Contains(c.Id) && c.Status == ChangeRequestStatus.PendingManagerReview, ct);
        var appts = await db.Appointments.CountAsync(a => held.Contains(a.Id) && a.Status == AppointmentStatus.Requested, ct);
        var openSos = (await sos.ListAsync(true, ct)).Count(x => held.Contains(x.Id) && x.AssignedMechanicId is null);
        return proposals + crs + appts + openSos;
    }

    private Task PublishAsync(CancellationToken ct)
        => notifier.PublishAsync(RealtimeEvents.ControlUpdated, new { at = clock.UtcNow }, new[] { RealtimeGroups.Staff }, ct);
}
