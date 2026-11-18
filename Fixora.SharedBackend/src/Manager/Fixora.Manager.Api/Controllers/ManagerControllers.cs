
using Fixora.Manager.Application.Staff;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using System.Runtime.InteropServices;

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

//[Route("api/v1/manager/auth")]
//public sealed class ManagerAuthController(StaffAuthService auth) : ControllerBase
//{
//    [HttpPost("login")]
//    [AllowAnonymous]
//    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
//    public Task<AuthTokens> Login(StaffLoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
//}


