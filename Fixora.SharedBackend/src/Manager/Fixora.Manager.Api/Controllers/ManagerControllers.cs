using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Manager.Api.Controllers;

/// <summary>Fixora.Manager.Api — owner / manager web dashboard endpoints (/api/v1/manager/*).</summary>
[ApiController]
[Authorize(Policy = Policies.Staff)]
public abstract class StaffControllerBase : ControllerBase
{
    protected Guid StaffId => HttpContext.RequestServices.GetRequiredService<ICurrentUser>().UserId;
}

[Route("api/v1/manager/auth")]
public sealed class ManagerAuthController(StaffAuthService auth) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    public Task<AuthTokens> Login(StaffLoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
}

[Route("api/v1/manager/bookings")]
public sealed class BookingsController(BookingService bookings) : StaffControllerBase
{
    [HttpGet] public Task<IReadOnlyList<BookingDto>> List([FromQuery] DateOnly? date, [FromQuery] string? status, CancellationToken ct) => bookings.ListForStaffAsync(date, status, ct);
    [HttpGet("slots")] public Task<IReadOnlyList<SlotDto>> Slots([FromQuery] DateOnly date, [FromQuery] Guid serviceId, CancellationToken ct) => bookings.GetSlotsAsync(date, serviceId, ct);
    [HttpPost("{id:guid}/confirm")] public Task<BookingDto> Confirm(Guid id, ConfirmBookingRequest req, CancellationToken ct) => bookings.ConfirmAsync(StaffId, id, req, ct);
    [HttpPost("{id:guid}/decline")] public Task<BookingDto> Decline(Guid id, DeclineBookingRequest req, CancellationToken ct) => bookings.DeclineAsync(StaffId, id, req.Reason, ct);
    [HttpPost("{id:guid}/reschedule")] public Task<BookingDto> Reschedule(Guid id, RescheduleRequest req, CancellationToken ct) => bookings.RescheduleAsync(StaffId, Roles.Manager, id, req.SlotStart, ct);
    [HttpPost("{id:guid}/cancel")] public Task<BookingDto> Cancel(Guid id, CancellationToken ct) => bookings.CancelAsync(StaffId, Roles.Manager, id, ct);
    [HttpPost("{id:guid}/check-in")] public Task<BookingDto> CheckIn(Guid id, CancellationToken ct) => bookings.CheckInAsync(StaffId, id, ct);
    [HttpPost("{id:guid}/no-show")] public Task<BookingDto> NoShow(Guid id, CancellationToken ct) => bookings.MarkNoShowAsync(id, ct);
    [HttpPost("walk-in")] public Task<JobSummaryDto> WalkIn(WalkInRequest req, CancellationToken ct) => bookings.WalkInAsync(StaffId, req, ct);
}

[Route("api/v1/manager/jobs")]
public sealed class JobsController(JobService jobs) : StaffControllerBase
{
    [HttpGet] public Task<IReadOnlyList<JobSummaryDto>> List([FromQuery] bool activeOnly = true, [FromQuery] Guid? customerId = null, CancellationToken ct = default) => jobs.ListAsync(activeOnly, null, customerId, ct);
    [HttpGet("{id:guid}")] public Task<JobDetailDto> Get(Guid id, CancellationToken ct) => jobs.GetAsync(id, WorkshopReadModel.Viewer.Staff, null, null, ct);
    [HttpPost("{id:guid}/assign")] public Task<JobSummaryDto> Assign(Guid id, AssignJobRequest req, CancellationToken ct) => jobs.AssignAsync(StaffId, id, req, ct);
    [HttpPost("{id:guid}/reorder")] public Task<JobSummaryDto> Reorder(Guid id, ReorderJobRequest req, CancellationToken ct) => jobs.ReorderAsync(id, req, ct);
    [HttpPost("{id:guid}/extend")] public Task<JobSummaryDto> Extend(Guid id, ExtendJobRequest req, CancellationToken ct) => jobs.ExtendAsync(id, req, ct);
}

[Route("api/v1/manager/mechanics")]
public sealed class MechanicsController(MechanicRosterService roster, InvitationService invitations) : StaffControllerBase
{
    [HttpGet] public Task<IReadOnlyList<MechanicRosterDto>> List(CancellationToken ct) => roster.ListAsync(ct);
    [HttpGet("invitations")] public Task<IReadOnlyList<InvitationDto>> Invitations(CancellationToken ct) => invitations.ListAsync(ct);
    [HttpPost("invitations")] public Task<InvitationDto> Invite(CreateInvitationRequest req, CancellationToken ct) => invitations.CreateAsync(StaffId, req, ct);
    [HttpDelete("invitations/{id:guid}")] public async Task<IActionResult> Revoke(Guid id, CancellationToken ct) { await invitations.RevokeAsync(id, ct); return NoContent(); }
}

[Route("api/v1/manager/customers")]
public sealed class CustomersController(ICustomerDirectory customers) : StaffControllerBase
{
    [HttpGet] public Task<IReadOnlyList<CustomerSummary>> List(CancellationToken ct) => customers.ListCustomersAsync(ct);
}

[Route("api/v1/manager/settings")]
public sealed class SettingsController(WorkshopSettingsService settings) : StaffControllerBase
{
    [HttpGet] public Task<WorkshopSettingsDto> Get(CancellationToken ct) => settings.GetAsync(ct);
    [HttpPut][Authorize(Policy = Policies.Owner)] public Task<WorkshopSettingsDto> Update(WorkshopSettingsDto req, CancellationToken ct) => settings.UpdateAsync(req, ct);
    [HttpGet("bays")] public Task<IReadOnlyList<BayDto>> Bays(CancellationToken ct) => settings.BaysAsync(ct);
    [HttpGet("services")] public Task<IReadOnlyList<ServiceDto>> Services(CancellationToken ct) => settings.ServicesAsync(true, ct);
    [HttpPost("services")] public Task<ServiceDto> CreateService(ServiceUpsert req, CancellationToken ct) => settings.UpsertServiceAsync(null, req, ct);
    [HttpPut("services/{id:guid}")] public Task<ServiceDto> UpdateService(Guid id, ServiceUpsert req, CancellationToken ct) => settings.UpsertServiceAsync(id, req, ct);
}
