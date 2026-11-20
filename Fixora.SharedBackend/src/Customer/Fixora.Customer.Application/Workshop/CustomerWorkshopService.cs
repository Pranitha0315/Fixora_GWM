using Fixora.Customer.Application.Common;
using Fixora.Customer.Application.Vehicles;
using Fixora.Manager.Application.Gateways;
using Fixora.Manager.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Application.Workshop;

/// <summary>
/// The customer's window on manager-owned records. Adds customer-side checks (vehicle ownership, names)
/// before calling the authenticated manager gateway. The app never reads workshop tables directly.
/// </summary>
public sealed class CustomerWorkshopService(WorkshopGateway workshop, VehicleService vehicles, ICustomerDb db)
{
    public Task<GarageDto> GarageAsync(CancellationToken ct) => workshop.GetGarageAsync(ct);
    public Task<IReadOnlyList<ServiceDto>> ServicesAsync(CancellationToken ct) => workshop.GetServicesAsync(ct);
}
