using Fixora.Customer.Contracts;
using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Auth;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Mechanic.Api.Controllers;

/// <summary>Fixora.Mechanic.Api — Fixora Rev endpoints (/api/v1/mechanic/*). Assigned-job guard on every job route.</summary>
[ApiController]
[Authorize(Policy = Policies.Mechanic)]
public abstract class MechanicControllerBase : ControllerBase
{
    protected Guid MechanicId => HttpContext.RequestServices.GetRequiredService<ICurrentUser>().UserId;
}

[Route("api/v1/mechanic/auth")]
[EnableRateLimiting("auth")]
public sealed class MechanicAuthController(MechanicAuthService auth) : ControllerBase
{
    [HttpPost("pin-login")][AllowAnonymous] public Task<AuthTokens> Login(PinLoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
    [HttpGet("invitations/{token}")][AllowAnonymous] public Task<InvitationInfo> Invitation(string token, CancellationToken ct) => auth.CheckInvitationAsync(token, ct);
    [HttpPost("invitations/accept")][AllowAnonymous] public Task<AuthTokens> Accept(AcceptInvitationRequest req, CancellationToken ct) => auth.AcceptInvitationAsync(req, ct);
}

[Route("api/v1/mechanic/profile")]
public sealed class MechanicProfileController(MechanicAuthService auth) : MechanicControllerBase
{
    [HttpGet] public Task<MechanicProfileDto> Get(CancellationToken ct) => auth.ProfileAsync(MechanicId, ct);
    [HttpPost("pin")] public async Task<IActionResult> ChangePin(ChangePinRequest req, CancellationToken ct) { await auth.ChangePinAsync(MechanicId, req, ct); return NoContent(); }
    [HttpPut("duty")] public Task<MechanicProfileDto> Duty(DutyRequest req, CancellationToken ct) => auth.SetDutyAsync(MechanicId, req.OnDuty, ct);
}

[Route("api/v1/mechanic/jobs")]
public sealed class AssignedJobsController(MechanicJobService jobs) : MechanicControllerBase
{
    [HttpGet] public Task<IReadOnlyList<JobSummaryDto>> Assigned(CancellationToken ct) => jobs.AssignedAsync(MechanicId, ct);
    [HttpGet("queue")] public Task<IReadOnlyList<JobSummaryDto>> Queue(CancellationToken ct) => jobs.QueueBoardAsync(ct);
    [HttpGet("{jobId:guid}")] public Task<MechanicJobDetailDto> Get(Guid jobId, CancellationToken ct) => jobs.DetailAsync(MechanicId, jobId, ct);

    /// <summary>start | pause | resume | progress | complete — progress reaches customer and manager in real time.</summary>
    [HttpPost("{jobId:guid}/actions")] public Task<JobSummaryDto> Action(Guid jobId, JobActionRequest req, CancellationToken ct) => jobs.ActionAsync(MechanicId, jobId, req, ct);
}
