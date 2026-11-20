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
