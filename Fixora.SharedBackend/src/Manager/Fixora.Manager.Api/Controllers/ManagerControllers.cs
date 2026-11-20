using Fixora.Manager.Application.Common;
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

[Route("api/v1/manager/mechanics")]
public sealed class MechanicsController(InvitationService invitations) : StaffControllerBase
{
    [HttpGet("invitations")] public Task<IReadOnlyList<InvitationDto>> Invitations(CancellationToken ct) => invitations.ListAsync(ct);
    [HttpPost("invitations")] public Task<InvitationDto> Invite(CreateInvitationRequest req, CancellationToken ct) => invitations.CreateAsync(StaffId, req, ct);
    [HttpDelete("invitations/{id:guid}")] public async Task<IActionResult> Revoke(Guid id, CancellationToken ct) { await invitations.RevokeAsync(id, ct); return NoContent(); }
}
