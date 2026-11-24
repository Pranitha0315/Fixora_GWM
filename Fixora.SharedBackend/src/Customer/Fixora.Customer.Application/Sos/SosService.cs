using Fixora.Customer.Application.Common;
using Fixora.Customer.Contracts;
using Fixora.Customer.Domain;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Application.Sos;

public sealed record CreateSosRequest(double Lat, double Lng, string Category, Guid? VehicleId, string? Note, bool LocationConsent);
public sealed record SosReceipt(Guid ReceiptId, string Status, DateTime ReceivedAt, string GaragePhone, bool Duplicate);

/// <summary>
/// Roadside SOS (USP 4), customer-owned. Routing: Customer → Manager (alert) → Manager dispatches →
/// Mechanic (alert) → status updates back to the Customer in real time.
/// </summary>
public sealed class SosService(ICustomerDb db, INotificationService notifier, IClock clock) : ISosOperations
{
    public static readonly string[] Categories = { "WontStart", "FlatTyre", "Accident", "Overheating", "Other" };

    // ---------------- customer side
    public async Task<SosReceipt> CreateAsync(Guid customerId, CreateSosRequest req, string idempotencyKey, string garagePhone, CancellationToken ct = default)
    {
        Guard.Against(string.IsNullOrWhiteSpace(idempotencyKey), "Idempotency-Key header is required.");
        Guard.Against(!req.LocationConsent, "Confirm that you want to share your location with the garage."); // GPS alone never sends
        Guard.Against(req.Lat is < -90 or > 90 || req.Lng is < -180 or > 180, "Location is not valid.");

        var existing = await db.SosRequests.AsNoTracking().FirstOrDefaultAsync(s => s.CustomerId == customerId && s.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return new SosReceipt(existing.Id, existing.Status.ToString(), existing.ReceivedAt, garagePhone, true);

        var customer = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == customerId, ct);
        Vehicle? vehicle = null;
        if (req.VehicleId is { } vid)
            vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vid && v.CustomerId == customerId, ct) ?? throw new NotFoundException("Vehicle");

        var now = clock.UtcNow;
        var sos = new SosRequest
        {
            CustomerId = customerId,
            VehicleId = vehicle?.Id,
            Lat = req.Lat,
            Lng = req.Lng,
            Category = Categories.Contains(req.Category) ? req.Category : "Other",
            Note = req.Note?.Trim(),
            IdempotencyKey = idempotencyKey,
            ReceivedAt = now,
            DriveSenseContext = vehicle is { DriveSenseOptIn: true } ? await RecentTripContextAsync(vehicle.Id, ct) : null,
        };
        sos.History.Add(new SosStatusHistory { SosRequestId = sos.Id, Status = SosStatus.Received, ActorRole = Roles.Customer, ActorId = customerId, At = now });
        db.SosRequests.Add(sos);
        await db.SaveChangesAsync(ct); // ← the receipt exists only after this line (BR-SOS-03)

        await notifier.NotifyAsync(new NotificationMessage(
                NotificationTypes.SosRaised,
                $"SOS · {customer.Name} · {Label(sos.Category)}",
                $"{vehicle?.Label ?? "Vehicle not given"} at {req.Lat:0.0000}, {req.Lng:0.0000}." + (sos.DriveSenseContext is null ? "" : $" {sos.DriveSenseContext}"),
                "sos", sos.Id, null,
                new Dictionary<string, string> { ["route"] = "sos", ["lat"] = req.Lat.ToString("0.000000"), ["lng"] = req.Lng.ToString("0.000000") }),
            new[] { Recipient.AllStaff() }, ct);
        await PublishAsync(sos, ct);
        return new SosReceipt(sos.Id, sos.Status.ToString(), sos.ReceivedAt, garagePhone, false);
    }

    public async Task<SosDto> GetForCustomerAsync(Guid customerId, Guid id, CancellationToken ct = default)
    {
        var sos = await Query().AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.CustomerId == customerId, ct) ?? throw new NotFoundException("SOS request");
        return await ToDtoAsync(sos, ct);
    }

    public async Task<IReadOnlyList<SosDto>> ListForCustomerAsync(Guid customerId, CancellationToken ct = default)
    {
        var rows = await Query().AsNoTracking().Where(s => s.CustomerId == customerId).OrderByDescending(s => s.ReceivedAt).Take(20).ToListAsync(ct);
        return await ToDtosAsync(rows, ct);
    }

    public async Task<SosDto> CancelByCustomerAsync(Guid customerId, Guid id, CancellationToken ct = default)
    {
        var sos = await Query().FirstOrDefaultAsync(s => s.Id == id && s.CustomerId == customerId, ct) ?? throw new NotFoundException("SOS request");
        sos.CancelByCustomer(customerId, clock.UtcNow);
        await db.SaveChangesAsync(ct);
        var to = new List<Recipient> { Recipient.AllStaff() };
        if (sos.AssignedMechanicId is { } m) to.Add(Recipient.User(Roles.Mechanic, m));
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.SosStatus, "SOS cancelled by customer", $"{Label(sos.Category)} request was cancelled.", "sos", sos.Id), to, ct);
        await PublishAsync(sos, ct);
        return await ToDtoAsync(sos, ct);
    }

    // ---------------- staff / mechanic side (ISosOperations)
    public async Task<IReadOnlyList<SosDto>> ListAsync(bool openOnly, CancellationToken ct = default)
    {
        var q = Query().AsNoTracking();
        if (openOnly) q = q.Where(s => s.Status != SosStatus.Resolved && s.Status != SosStatus.Cancelled);
        return await ToDtosAsync(await q.OrderByDescending(s => s.ReceivedAt).Take(100).ToListAsync(ct), ct);
    }

    public async Task<IReadOnlyList<SosDto>> ListForMechanicAsync(Guid mechanicId, CancellationToken ct = default)
        => await ToDtosAsync(await Query().AsNoTracking().Where(s => s.AssignedMechanicId == mechanicId).OrderByDescending(s => s.ReceivedAt).Take(50).ToListAsync(ct), ct);

    public async Task<SosDto> AcknowledgeAsync(Guid sosId, Guid staffId, string? note, CancellationToken ct = default)
    {
        var sos = await LoadAsync(sosId, ct);
        sos.MoveTo(SosStatus.Acknowledged, Roles.Manager, staffId, note, clock.UtcNow);
        sos.AcknowledgedBy = staffId;
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.SosStatus, "The garage received your SOS",
                note ?? "A manager is arranging help now. Keep your phone nearby.", "sos", sos.Id, null, Route()),
            new[] { Recipient.User(Roles.Customer, sos.CustomerId) }, ct);
        await PublishAsync(sos, ct);
        return await ToDtoAsync(sos, ct);
    }

    public async Task<SosDto> DispatchAsync(Guid sosId, Guid staffId, Guid mechanicId, string? note, CancellationToken ct = default)
    {
        var sos = await LoadAsync(sosId, ct);
        sos.MoveTo(SosStatus.Dispatched, Roles.Manager, staffId, note, clock.UtcNow);
        sos.AssignedMechanicId = mechanicId;
        sos.AcknowledgedBy ??= staffId;
        await db.SaveChangesAsync(ct);

        var customer = await db.Customers.AsNoTracking().FirstAsync(c => c.Id == sos.CustomerId, ct);
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.SosDispatched, $"SOS dispatch · {Label(sos.Category)}",
                $"Go to {customer.Name} ({customer.Phone}) at {sos.Lat:0.0000}, {sos.Lng:0.0000}." + (note is null ? "" : $" Manager: {note}") + (sos.DriveSenseContext is null ? "" : $" {sos.DriveSenseContext}"),
                "sos", sos.Id, null, new Dictionary<string, string> { ["route"] = "sos", ["lat"] = sos.Lat.ToString("0.000000"), ["lng"] = sos.Lng.ToString("0.000000") }),
            new[] { Recipient.User(Roles.Mechanic, mechanicId) }, ct);
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.SosDispatched, "Help is on the way",
                "A mechanic has been dispatched to your location.", "sos", sos.Id, null, Route()),
            new[] { Recipient.User(Roles.Customer, sos.CustomerId) }, ct);
        await PublishAsync(sos, ct);
        return await ToDtoAsync(sos, ct);
    }

    public async Task<SosDto> UpdateStatusAsync(Guid sosId, string actorRole, Guid actorId, string status, string? note, CancellationToken ct = default)
    {
        var sos = await LoadAsync(sosId, ct);
        if (actorRole == Roles.Mechanic && sos.AssignedMechanicId != actorId) throw new NotFoundException("SOS request");
        if (!Enum.TryParse<SosStatus>(status, true, out var next) || next is SosStatus.Received)
            throw new ValidationException("Status must be Acknowledged, Dispatched, OnSite, Resolved or Cancelled.");
        sos.MoveTo(next, actorRole, actorId, note, clock.UtcNow);
        await db.SaveChangesAsync(ct);

        var text = next switch
        {
            SosStatus.OnSite => "The mechanic has reached you.",
            SosStatus.Resolved => "Your SOS is resolved. We hope you are safe.",
            SosStatus.Cancelled => "Your SOS was closed by the garage.",
            _ => $"Status: {next}",
        };
        var to = new List<Recipient> { Recipient.User(Roles.Customer, sos.CustomerId) };
        if (actorRole == Roles.Mechanic) to.Add(Recipient.AllStaff());
        await notifier.NotifyAsync(new NotificationMessage(NotificationTypes.SosStatus, $"SOS · {next}", note is null ? text : $"{text} {note}", "sos", sos.Id, null, Route()), to, ct);
        await PublishAsync(sos, ct);
        return await ToDtoAsync(sos, ct);
    }

    // ---------------- helpers
    private IQueryable<SosRequest> Query() => db.SosRequests.Include(s => s.History);

    private async Task<SosRequest> LoadAsync(Guid id, CancellationToken ct)
        => await Query().FirstOrDefaultAsync(s => s.Id == id, ct) ?? throw new NotFoundException("SOS request");

    private async Task<string?> RecentTripContextAsync(Guid vehicleId, CancellationToken ct)
    {
        var trip = await db.Trips.AsNoTracking().Where(t => t.VehicleId == vehicleId && t.StartedAt >= clock.UtcNow.AddHours(-6))
            .OrderByDescending(t => t.StartedAt).FirstOrDefaultAsync(ct);
        return trip is null ? null : $"DriveSense: last trip {trip.DistanceKm:0.#} km, {trip.PotholeCount} pothole hits, {trip.HarshBrakes} harsh brakes.";
    }

    private static Dictionary<string, string> Route() => new() { ["route"] = "sos" };

    public static string Label(string category) => category switch
    {
        "WontStart" => "Won't start",
        "FlatTyre" => "Flat tyre",
        "Accident" => "Accident",
        "Overheating" => "Overheating",
        _ => "Other",
    };

    private async Task PublishAsync(SosRequest sos, CancellationToken ct)
    {
        var dto = await ToDtoAsync(sos, ct);
        var groups = new List<string> { RealtimeGroups.Staff, RealtimeGroups.User(sos.CustomerId) };
        if (sos.AssignedMechanicId is { } m) groups.Add(RealtimeGroups.User(m));
        await notifier.PublishAsync(RealtimeEvents.SosUpdated, dto, groups, ct);
    }

    private async Task<IReadOnlyList<SosDto>> ToDtosAsync(List<SosRequest> rows, CancellationToken ct)
    {
        var list = new List<SosDto>();
        foreach (var s in rows) list.Add(await ToDtoAsync(s, ct));
        return list;
    }

    private async Task<SosDto> ToDtoAsync(SosRequest s, CancellationToken ct)
    {
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == s.CustomerId, ct);
        var vehicle = s.VehicleId is null ? null : await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(v => v.Id == s.VehicleId, ct);
        return new SosDto(s.Id, s.CustomerId, customer?.Name ?? "", customer?.Phone ?? "", s.VehicleId, vehicle?.Label, s.Lat, s.Lng, s.Category, s.Note,
            s.Status.ToString(), s.ReceivedAt, s.AssignedMechanicId, s.DriveSenseContext,
            s.History.OrderBy(h => h.At).Select(h => new SosHistoryDto(h.Status.ToString(), h.ActorRole, h.At, h.Note)).ToList());
    }
}
