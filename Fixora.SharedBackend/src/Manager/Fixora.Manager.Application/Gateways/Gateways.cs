using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Gateways;

/// <summary>Customer-facing gateway: canonical records stay manager-owned; customers only see their own.</summary>
public sealed class WorkshopGateway(
    IManagerDb db,
    WorkshopSettingsService settings,
    IClock clock) : IWorkshopGateway
{
    public async Task<GarageDto> GetGarageAsync(CancellationToken ct = default)
    {
        var w = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var open = w.IsOpenAt(clock.UtcNow);
        return new GarageDto(w.Id, w.Name, w.Phone, w.EmergencyPhone, w.Address, w.Lat, w.Lng, w.OpenTime.ToString("HH:mm"), w.CloseTime.ToString("HH:mm"),
            open, open ? null : $"Opens at {w.OpenTime:HH:mm}", w.LoyaltyEnabled, w.LoyaltyPercent, w.LoyaltyCapRupees);
    }

    public Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken ct = default) => settings.ServicesAsync(false, ct);
}
