using Fixora.Customer.Application.Auth;
using Fixora.Customer.Application.Common;
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
    [HttpPost("register")][AllowAnonymous] public Task<OtpSentResponse> Register(RegisterRequest req, CancellationToken ct) => auth.RegisterAsync(req, ct);
    [HttpPost("verify-otp")][AllowAnonymous] public Task<AuthTokens> Verify(VerifyOtpRequest req, CancellationToken ct) => auth.VerifyOtpAsync(req, ct);
    [HttpPost("resend-otp")][AllowAnonymous] public Task<OtpSentResponse> Resend(ResendOtpRequest req, CancellationToken ct) => auth.ResendOtpAsync(req.Email, ct);
    [HttpPost("login")][AllowAnonymous] public Task<AuthTokens> Login(LoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
    [HttpPost("forgot-password")][AllowAnonymous] public Task<OtpSentResponse> Forgot(ForgotPasswordRequest req, CancellationToken ct) => auth.ForgotPasswordAsync(req, ct);
    [HttpPost("reset-password")][AllowAnonymous] public async Task<IActionResult> Reset(ResetPasswordRequest req, CancellationToken ct) { await auth.ResetPasswordAsync(req, ct); return NoContent(); }
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
