using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Vehicles;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Customer.Api.Controllers;

/// <summary>Fixora.Customer.Api — outward controllers for the customer mobile app (/api/v1/customer/*).</summary>
[ApiController]
[Authorize(Policy = Policies.Customer)]
public abstract class CustomerControllerBase : ControllerBase
{
    protected ICurrentUser Me => HttpContext.RequestServices.GetRequiredService<ICurrentUser>();
    protected Guid CustomerId => Me.UserId;
}

[Route("api/v1/customer/vehicles")]
public sealed class VehiclesController(VehicleService vehicles) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<VehicleDto>> List(CancellationToken ct) => vehicles.ListAsync(CustomerId, ct);
    [HttpPost] public Task<VehicleDto> Add(VehicleUpsert req, CancellationToken ct) => vehicles.AddAsync(CustomerId, req, ct);
    [HttpPut("{id:guid}")] public Task<VehicleDto> Update(Guid id, VehicleUpsert req, CancellationToken ct) => vehicles.UpdateAsync(CustomerId, id, req, ct);
    [HttpDelete("{id:guid}")] public async Task<IActionResult> Remove(Guid id, CancellationToken ct) { await vehicles.RemoveAsync(CustomerId, id, ct); return NoContent(); }
    [HttpPut("{id:guid}/drivesense")] public Task<VehicleDto> Consent(Guid id, DriveSenseConsent req, CancellationToken ct) => vehicles.SetDriveSenseAsync(CustomerId, id, req.OptIn, ct);
}

[Route("api/v1/customer/drivesense")]
public sealed class DriveSenseController(DriveSenseService drivesense) : CustomerControllerBase
{
    /// <summary>POST /api/v1/customer/drivesense/trips — upload on-device trip summaries.</summary>
    [HttpPost("trips")]
    public Task<IReadOnlyList<TripDto>> Upload(IReadOnlyList<TripSummaryUpload> trips, CancellationToken ct)
        => drivesense.UploadAsync(CustomerId, trips, ct);

    [HttpGet("vehicles/{vehicleId:guid}")]
    public Task<DriveSenseSummaryDto> Summary(Guid vehicleId, CancellationToken ct)
        => drivesense.GetSummaryAsync(CustomerId, vehicleId, ct);

    [HttpGet("vehicles/{vehicleId:guid}/trips")]
    public Task<IReadOnlyList<TripDto>> Trips(Guid vehicleId, CancellationToken ct)
        => drivesense.ListTripsAsync(CustomerId, vehicleId, ct);

    [HttpPost("vehicles/{vehicleId:guid}/simulate")]
    public Task<ReplayResult> Simulate(Guid vehicleId, CancellationToken ct)
        => drivesense.ReplayDemoAsync(CustomerId, vehicleId, ct);

    [HttpDelete("data")]
    public async Task<object> DeleteAll(CancellationToken ct)
        => new { deleted = await drivesense.DeleteAllAsync(CustomerId, ct) };
}
