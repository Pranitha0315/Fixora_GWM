using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Builds DTOs from manager-owned rows, resolving bay and mechanic names once per request.</summary>
public sealed class WorkshopReadModel(IManagerDb db, IMechanicDirectory mechanics, IClock clock)
{
    private Dictionary<Guid, string>? _mechanicNames;
    private Dictionary<Guid, string>? _bayNames;

    public async Task<string?> MechanicNameAsync(Guid? id, CancellationToken ct = default)
    {
        if (id is null) return null;
        _mechanicNames ??= (await mechanics.ListAsync(ct)).ToDictionary(m => m.Id, m => m.Name);
        return _mechanicNames.TryGetValue(id.Value, out var n) ? n : null;
    }

    public async Task<string?> BayNameAsync(Guid? id, CancellationToken ct = default)
    {
        if (id is null) return null;
        _bayNames ??= await db.Bays.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.Name, ct);
        return _bayNames.TryGetValue(id.Value, out var n) ? n : null;
    }

    public async Task<BookingDto> BookingAsync(Appointment a, CancellationToken ct = default) => new(
        a.Id, a.CustomerId, a.CustomerName, a.VehicleId, a.VehicleLabel, a.ServiceId, a.ServiceName, a.SlotStart, a.SlotEnd,
        a.Status.ToString(), a.Source.ToString(), a.JobCardId, a.BayId, await BayNameAsync(a.BayId, ct),
        a.MechanicId, await MechanicNameAsync(a.MechanicId, ct), a.Notes, a.PromoCode, a.DeclineReason, a.CreatedAt);
}
