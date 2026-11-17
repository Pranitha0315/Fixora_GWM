using Fixora.Customer.Application.Auth;
using Fixora.Customer.Application.Common;
using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Sos;
using Fixora.Customer.Application.Vehicles;
using Fixora.Customer.Application.Workshop;
using Fixora.Customer.Contracts;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Customer.Api.Controllers;

/// <summary>Fixora.Customer.Api — 18 outward controllers for the customer mobile app (/api/v1/customer/*).</summary>
[ApiController]
[Authorize(Policy = Policies.Customer)]
public abstract class CustomerControllerBase : ControllerBase
{
    protected ICurrentUser Me => HttpContext.RequestServices.GetRequiredService<ICurrentUser>();
    protected Guid CustomerId => Me.UserId;
}

public sealed record ResendOtpRequest(string Email);

// 1
[Route("api/v1/customer/auth")]
[EnableRateLimiting("auth")]
public sealed class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("register")] [AllowAnonymous] public Task<OtpSentResponse> Register(RegisterRequest req, CancellationToken ct) => auth.RegisterAsync(req, ct);
    [HttpPost("verify-otp")] [AllowAnonymous] public Task<AuthTokens> Verify(VerifyOtpRequest req, CancellationToken ct) => auth.VerifyOtpAsync(req, ct);
    [HttpPost("resend-otp")] [AllowAnonymous] public Task<OtpSentResponse> Resend(ResendOtpRequest req, CancellationToken ct) => auth.ResendOtpAsync(req.Email, ct);
    [HttpPost("login")] [AllowAnonymous] public Task<AuthTokens> Login(LoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
    [HttpPost("forgot-password")] [AllowAnonymous] public Task<OtpSentResponse> Forgot(ForgotPasswordRequest req, CancellationToken ct) => auth.ForgotPasswordAsync(req, ct);
    [HttpPost("reset-password")] [AllowAnonymous] public async Task<IActionResult> Reset(ResetPasswordRequest req, CancellationToken ct) { await auth.ResetPasswordAsync(req, ct); return NoContent(); }
}

// 2
[Route("api/v1/customer/profile")]
public sealed class ProfileController(AuthService auth) : CustomerControllerBase
{
    [HttpGet] public Task<ProfileDto> Get(CancellationToken ct) => auth.GetProfileAsync(CustomerId, ct);
    [HttpPut] public Task<ProfileDto> Update(UpdateProfileRequest req, CancellationToken ct) => auth.UpdateProfileAsync(CustomerId, req, ct);
}

// 3
[Route("api/v1/customer/vehicles")]
public sealed class VehiclesController(VehicleService vehicles) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<VehicleDto>> List(CancellationToken ct) => vehicles.ListAsync(CustomerId, ct);
    [HttpPost] public Task<VehicleDto> Add(VehicleUpsert req, CancellationToken ct) => vehicles.AddAsync(CustomerId, req, ct);
    [HttpPut("{id:guid}")] public Task<VehicleDto> Update(Guid id, VehicleUpsert req, CancellationToken ct) => vehicles.UpdateAsync(CustomerId, id, req, ct);
    [HttpDelete("{id:guid}")] public async Task<IActionResult> Remove(Guid id, CancellationToken ct) { await vehicles.RemoveAsync(CustomerId, id, ct); return NoContent(); }
    [HttpPut("{id:guid}/drivesense")] public Task<VehicleDto> Consent(Guid id, DriveSenseConsent req, CancellationToken ct) => vehicles.SetDriveSenseAsync(CustomerId, id, req.OptIn, ct);
}

// 4
[Route("api/v1/customer/garage")]
public sealed class GarageController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet] public Task<GarageDto> Get(CancellationToken ct) => workshop.GarageAsync(ct);
    [HttpGet("services")] public Task<IReadOnlyList<ServiceDto>> Services(CancellationToken ct) => workshop.ServicesAsync(ct);
}

// 5
[Route("api/v1/customer/appointments")]
public sealed class AppointmentsController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet("slots")] public Task<IReadOnlyList<SlotDto>> Slots([FromQuery] DateOnly date, [FromQuery] Guid serviceId, CancellationToken ct) => workshop.SlotsAsync(date, serviceId, ct);
    [HttpGet] public Task<IReadOnlyList<BookingDto>> List(CancellationToken ct) => workshop.BookingsAsync(CustomerId, ct);
    [HttpPost] public Task<BookingDto> Book(BookingRequest req, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => workshop.BookAsync(CustomerId, req, key ?? "", ct);
    [HttpPost("{id:guid}/cancel")] public Task<BookingDto> Cancel(Guid id, CancellationToken ct) => workshop.CancelAsync(CustomerId, id, ct);
    [HttpPost("{id:guid}/reschedule")] public Task<BookingDto> Reschedule(Guid id, RescheduleBody req, CancellationToken ct) => workshop.RescheduleAsync(CustomerId, id, req.SlotStart, ct);
}
public sealed record RescheduleBody(DateTime SlotStart);

// 6
[Route("api/v1/customer/queue")]
public sealed class QueueController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    /// <summary>Indicative ETA; the response always carries indicative: true (BR-AQ-07).</summary>
    [HttpGet("{jobId:guid}")] public Task<QueueEstimateDto> Get(Guid jobId, CancellationToken ct) => workshop.QueueAsync(CustomerId, jobId, ct);
}

// 7
[Route("api/v1/customer/jobs")]
public sealed class JobsController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<JobSummaryDto>> List([FromQuery] bool activeOnly = false, CancellationToken ct = default) => workshop.JobsAsync(CustomerId, activeOnly, ct);
    [HttpGet("{id:guid}")] public Task<JobDetailDto> Get(Guid id, CancellationToken ct) => workshop.JobAsync(CustomerId, id, ct);
}

// 8
[Route("api/v1/customer/fixproof")]
public sealed class FixProofController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    /// <summary>Verified report only: confirmed findings that the manager has published with a proposal.</summary>
    [HttpGet("jobs/{jobId:guid}/report")]
    public async Task<object> Report(Guid jobId, CancellationToken ct)
    {
        var job = await workshop.JobAsync(CustomerId, jobId, ct);
        return new { job.Job.Id, job.Job.Number, job.Job.VehicleLabel, issues = job.Issues, proposals = job.Proposals, verified = true };
    }
}

// 9
[Route("api/v1/customer/approvals")]
public sealed class RepairApprovalsController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet("pending")] public Task<IReadOnlyList<ProposalDto>> Pending(CancellationToken ct) => workshop.PendingApprovalsAsync(CustomerId, ct);

    /// <summary>Per-item approve / reject. Requires Idempotency-Key; stale item version → 409.</summary>
    [HttpPost("{proposalId:guid}/decisions")]
    public Task<ProposalDto> Decide(Guid proposalId, DecideItemsRequest req, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
        => workshop.DecideAsync(CustomerId, proposalId, req, key ?? "", ct);
}

// 10
[Route("api/v1/customer/jobs/{jobId:guid}/change-requests")]
public sealed class ChangeRequestsController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpPost] public Task<ChangeRequestDto> Create(Guid jobId, ChangeRequestCreate req, CancellationToken ct) => workshop.ChangeRequestAsync(CustomerId, jobId, req, ct);
}

// 11
[Route("api/v1/customer/evidence")]
public sealed class EvidenceController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    /// <summary>Evidence Passport: published findings with short-lived signed media URLs, newest first.</summary>
    [HttpGet]
    public async Task<IReadOnlyList<object>> Passport([FromQuery] Guid? vehicleId, CancellationToken ct)
    {
        var jobs = await workshop.JobsAsync(CustomerId, false, ct);
        var list = new List<object>();
        foreach (var j in jobs.Where(j => vehicleId is null || j.VehicleId == vehicleId))
        {
            var d = await workshop.JobAsync(CustomerId, j.Id, ct);
            list.AddRange(d.Issues.Select(i => (object)new { jobId = j.Id, j.Number, j.VehicleId, j.VehicleLabel, issue = i }));
        }
        return list;
    }
}

// 12
[Route("api/v1/customer/sos")]
public sealed class SosController(SosService sos, CustomerWorkshopService workshop) : CustomerControllerBase
{
    /// <summary>"Delivered" is shown only after this returns a receipt (BR-SOS-03). Same Idempotency-Key → same receipt.</summary>
    [HttpPost("requests")]
    [EnableRateLimiting("sos")]
    public async Task<SosReceipt> Create(CreateSosRequest req, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var garage = await workshop.GarageAsync(ct);
        return await sos.CreateAsync(CustomerId, req, key ?? "", garage.EmergencyPhone, ct);
    }

    [HttpGet("requests")] public Task<IReadOnlyList<SosDto>> List(CancellationToken ct) => sos.ListForCustomerAsync(CustomerId, ct);
    [HttpGet("requests/{id:guid}")] public Task<SosDto> Get(Guid id, CancellationToken ct) => sos.GetForCustomerAsync(CustomerId, id, ct);
    [HttpPost("requests/{id:guid}/cancel")] public Task<SosDto> Cancel(Guid id, CancellationToken ct) => sos.CancelByCustomerAsync(CustomerId, id, ct);
}

// 13
[Route("api/v1/customer/drivesense")]
public sealed class DriveSenseController(DriveSenseService drivesense) : CustomerControllerBase
{
    [HttpPost("trips")] public Task<IReadOnlyList<TripDto>> Upload(IReadOnlyList<TripSummaryUpload> trips, CancellationToken ct) => drivesense.UploadAsync(CustomerId, trips, ct);
    [HttpGet("vehicles/{vehicleId:guid}")] public Task<DriveSenseSummaryDto> Summary(Guid vehicleId, CancellationToken ct) => drivesense.GetSummaryAsync(CustomerId, vehicleId, ct);
    [HttpGet("vehicles/{vehicleId:guid}/trips")] public Task<IReadOnlyList<TripDto>> Trips(Guid vehicleId, CancellationToken ct) => drivesense.ListTripsAsync(CustomerId, vehicleId, ct);
    [HttpPost("vehicles/{vehicleId:guid}/simulate")] public Task<ReplayResult> Simulate(Guid vehicleId, CancellationToken ct) => drivesense.ReplayDemoAsync(CustomerId, vehicleId, ct);
    [HttpDelete("data")] public async Task<object> DeleteAll(CancellationToken ct) => new { deleted = await drivesense.DeleteAllAsync(CustomerId, ct) };
}

// 14
[Route("api/v1/customer/suggestions")]
public sealed class MaintenanceSuggestionsController(DriveSenseService drivesense) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<SuggestionDto>> List(CancellationToken ct) => drivesense.ListSuggestionsAsync(CustomerId, ct);
    [HttpPost("{id:guid}/dismiss")] public Task<SuggestionDto> Dismiss(Guid id, CancellationToken ct) => drivesense.DismissAsync(CustomerId, id, ct);
    [HttpPost("{id:guid}/book")]
    public Task<BookingDto> Book(Guid id, BookSuggestionRequest req, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
        => drivesense.BookAsync(CustomerId, Me.Name, id, req, key ?? "", ct);
}

// 15
[Route("api/v1/customer/loyalty")]
public sealed class LoyaltyController(CustomerDirectory directory) : CustomerControllerBase
{
    [HttpGet] public Task<LoyaltyDto> Get(CancellationToken ct) => directory.GetLoyaltyAsync(CustomerId, ct);
}

// 16
[Route("api/v1/customer/invoices")]
public sealed class InvoicesController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<InvoiceDto>> List(CancellationToken ct) => workshop.InvoicesAsync(CustomerId, ct);
}

// 17
[Route("api/v1/customer/service-history")]
public sealed class ServiceHistoryController(CustomerWorkshopService workshop) : CustomerControllerBase
{
    [HttpGet] public Task<IReadOnlyList<ServiceHistoryDto>> List([FromQuery] Guid? vehicleId, CancellationToken ct) => workshop.HistoryAsync(CustomerId, vehicleId, ct);
}

// 18
[Route("api/v1/customer/home")]
public sealed class HomeController(CustomerWorkshopService workshop, DriveSenseService drivesense, VehicleService vehicles) : CustomerControllerBase
{
    /// <summary>Home dashboard: active job, pending approvals, next booking, open suggestions, drive score.</summary>
    [HttpGet]
    public async Task<object> Get(CancellationToken ct)
    {
        var jobs = await workshop.JobsAsync(CustomerId, true, ct);
        var approvals = await workshop.PendingApprovalsAsync(CustomerId, ct);
        var bookings = await workshop.BookingsAsync(CustomerId, ct);
        var suggestions = (await drivesense.ListSuggestionsAsync(CustomerId, ct)).Where(s => s.Status == "Open").ToList();
        var myVehicles = await vehicles.ListAsync(CustomerId, ct);
        var ds = myVehicles.FirstOrDefault(v => v.DriveSenseOptIn);
        var score = ds is null ? null : await drivesense.GetSummaryAsync(CustomerId, ds.Id, ct);
        return new
        {
            activeJobs = jobs,
            pendingApprovals = approvals,
            nextBooking = bookings.Where(b => b.Status is "Requested" or "Confirmed").OrderBy(b => b.SlotStart).FirstOrDefault(),
            suggestions,
            driveScore = score is null ? null : new { score.VehicleId, score.CurrentScore, score.RoughRoadPct, score.LoyaltyPoints },
        };
    }
}
