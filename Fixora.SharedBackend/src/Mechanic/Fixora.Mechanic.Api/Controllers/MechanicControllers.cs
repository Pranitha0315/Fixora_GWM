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
