using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Application.Approvals;
using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Control;
using Fixora.Manager.Application.Inventory;
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

public sealed record NoteRequest(string? Note);
public sealed record PriceRequest(decimal UnitPrice, int Qty);
public sealed record DispatchRequest(Guid MechanicId, string? Note);
public sealed record SosStatusRequest(string Status, string? Note);
public sealed record FeedbackRequest(int Vote);

[Route("api/v1/manager/auth")]
public sealed class ManagerAuthController(StaffAuthService auth) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
    public Task<AuthTokens> Login(StaffLoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
}

[Route("api/v1/manager/dashboard")]
public sealed class DashboardController(DashboardService dashboard) : StaffControllerBase
{
    [HttpGet] public Task<DashboardDto> Get(CancellationToken ct) => dashboard.GetAsync(ct);
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

/// <summary>The manager's approval inbox: both directions of the hand-off live here.</summary>
[Route("api/v1/manager/approvals")]
public sealed class ApprovalsController(ApprovalWorkflowService approvals, ChangeRequestService changes) : StaffControllerBase
{
    [HttpGet("proposals")] public Task<IReadOnlyList<ProposalDto>> Proposals([FromQuery] string? status, CancellationToken ct) => approvals.ListForStaffAsync(status, ct);
    [HttpPut("proposals/{id:guid}/items/{itemId:guid}/price")] public Task<ProposalDto> SetPrice(Guid id, Guid itemId, PriceRequest req, CancellationToken ct) => approvals.SetItemPriceAsync(StaffId, id, itemId, req.UnitPrice, req.Qty, ct);
    [HttpPost("proposals/{id:guid}/forward")] public Task<ProposalDto> Forward(Guid id, NoteRequest req, CancellationToken ct) => approvals.ForwardToCustomerAsync(StaffId, id, req.Note, ct);
    [HttpPost("proposals/{id:guid}/return")] public Task<ProposalDto> Return(Guid id, NoteRequest req, CancellationToken ct) => approvals.ReturnToMechanicAsync(StaffId, id, req.Note ?? "", ct);
    [HttpPost("proposals/{id:guid}/release")] public Task<ProposalDto> Release(Guid id, NoteRequest req, CancellationToken ct) => approvals.ReleaseAsync(StaffId, id, req.Note, ct);
    [HttpPut("proposals/{id:guid}/items/{itemId:guid}/revise")] public Task<ProposalDto> Revise(Guid id, Guid itemId, PriceRequest req, CancellationToken ct) => approvals.ReviseItemAsync(StaffId, id, itemId, req.UnitPrice, req.Qty, ct);

    [HttpGet("change-requests")] public Task<IReadOnlyList<ChangeRequestDto>> ChangeRequests([FromQuery] bool pendingOnly = false, CancellationToken ct = default) => changes.ListForStaffAsync(pendingOnly, ct);
    [HttpPost("change-requests/{id:guid}/forward")] public Task<ChangeRequestDto> ForwardChange(Guid id, NoteRequest req, CancellationToken ct) => changes.ForwardAsync(StaffId, id, req.Note, ct);
    [HttpPost("change-requests/{id:guid}/decline")] public Task<ChangeRequestDto> DeclineChange(Guid id, NoteRequest req, CancellationToken ct) => changes.DeclineAsync(StaffId, id, req.Note ?? "", ct);
}

[Route("api/v1/manager/sos")]
public sealed class SosDispatchController(ISosOperations sos) : StaffControllerBase
{
    [HttpGet] public Task<IReadOnlyList<SosDto>> List([FromQuery] bool openOnly = true, CancellationToken ct = default) => sos.ListAsync(openOnly, ct);
    [HttpPost("{id:guid}/acknowledge")] public Task<SosDto> Acknowledge(Guid id, NoteRequest req, CancellationToken ct) => sos.AcknowledgeAsync(id, StaffId, req.Note, ct);
    [HttpPost("{id:guid}/dispatch")] public Task<SosDto> Dispatch(Guid id, DispatchRequest req, CancellationToken ct) => sos.DispatchAsync(id, StaffId, req.MechanicId, req.Note, ct);
    [HttpPost("{id:guid}/status")] public Task<SosDto> Status(Guid id, SosStatusRequest req, CancellationToken ct) => sos.UpdateStatusAsync(id, Roles.Manager, StaffId, req.Status, req.Note, ct);
}

[Route("api/v1/manager/billing")]
public sealed class BillingController(BillingService billing) : StaffControllerBase
{
    [HttpGet("invoices")] public Task<IReadOnlyList<InvoiceDto>> Invoices([FromQuery] string? status, CancellationToken ct) => billing.ListAsync(null, status, ct);
    [HttpPost("invoices/{id:guid}/payments")] public Task<InvoiceDto> Pay(Guid id, RecordPaymentRequest req, CancellationToken ct) => billing.RecordPaymentAsync(StaffId, id, req, ct);
    [HttpPost("jobs/{jobId:guid}/invoice")] public Task<InvoiceDto> CreateForJob(Guid jobId, CancellationToken ct) => billing.CreateInvoiceForJobAsync(jobId, ct);
}

[Route("api/v1/manager/inventory")]
public sealed class InventoryController(InventoryService inventory) : StaffControllerBase
{
    [HttpGet("parts")] public Task<IReadOnlyList<PartDto>> Parts([FromQuery] bool lowOnly = false, CancellationToken ct = default) => inventory.ListAsync(lowOnly, ct);
    [HttpPost("parts")] public Task<PartDto> Create(PartUpsert req, CancellationToken ct) => inventory.UpsertAsync(null, req, ct);
    [HttpPut("parts/{id:guid}")] public Task<PartDto> Update(Guid id, PartUpsert req, CancellationToken ct) => inventory.UpsertAsync(id, req, ct);
    [HttpPost("parts/{id:guid}/adjust")] public Task<PartDto> Adjust(Guid id, StockAdjust req, CancellationToken ct) => inventory.AdjustAsync(id, req, ct);
    [HttpGet("orders")] public Task<IReadOnlyList<PartsOrderDto>> Orders(CancellationToken ct) => inventory.ListOrdersAsync(ct);
    [HttpPost("orders")] public Task<PartsOrderDto> Order(PartsOrderCreate req, CancellationToken ct) => inventory.PlaceOrderAsync(req, ct);
    [HttpPost("orders/{id:guid}/delivered")] public Task<PartsOrderDto> Delivered(Guid id, CancellationToken ct) => inventory.MarkDeliveredAsync(id, ct);
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
    [HttpGet("vehicles/{vehicleId:guid}/drivesense")] public Task<DriveSenseHintDto?> Hint(Guid vehicleId, CancellationToken ct) => customers.GetDriveSenseHintAsync(vehicleId, ct);
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

[Route("api/v1/manager/advisor")]
public sealed class AdvisorController(AdvisorService advisor) : StaffControllerBase
{
    [HttpGet("briefing")] public Task<BriefingDto> Briefing(CancellationToken ct) => advisor.GetBriefingAsync(ct);
    [HttpGet("metrics")] public Task<WeeklyMetrics> Metrics(CancellationToken ct) => advisor.ComputeMetricsAsync(ct);
    [HttpPost("run")] public Task<BriefingDto> Run(CancellationToken ct) => advisor.RunWeeklyAsync(ct);
    [HttpPost("simulate-next-week")] public Task<BriefingDto> Simulate(CancellationToken ct) => advisor.SimulateNextWeekAsync(ct);
    [HttpPost("insights/{id:guid}/act")] public Task<AdvisorActResult> Act(Guid id, AdvisorActRequest req, CancellationToken ct) => advisor.ActAsync(StaffId, id, req, ct);
    [HttpPost("insights/{id:guid}/feedback")] public async Task<IActionResult> Feedback(Guid id, FeedbackRequest req, CancellationToken ct) { await advisor.FeedbackAsync(id, req.Vote, ct); return NoContent(); }
    [HttpPost("chat")] public Task<ChatAnswer> Chat(ChatRequest req, CancellationToken ct) => advisor.ChatAsync(req, ct);
}

/// <summary>Manager mode / Auto mode switch and what Auto mode did.</summary>
[Route("api/v1/manager/control")]
public sealed class ControlModeController(AutoPilotService autoPilot) : StaffControllerBase
{
    [HttpGet] public Task<ControlStatusDto> Get(CancellationToken ct) => autoPilot.StatusAsync(ct);
    [HttpPut] public Task<ControlStatusDto> Update(ControlUpdateRequest req, CancellationToken ct) => autoPilot.UpdateAsync(StaffId, req, ct);
    [HttpPost("seen")] public async Task<IActionResult> Seen(CancellationToken ct) { await autoPilot.MarkSeenAsync(ct); return NoContent(); }
}
