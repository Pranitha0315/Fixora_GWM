using Fixora.Customer.Application.Auth;

using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using System.Runtime.InteropServices;

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
//[Route("api/v1/customer/auth")]
//[EnableRateLimiting("auth")]
//public sealed class AuthController(AuthService auth) : ControllerBase
//{
//    [HttpPost("register")][AllowAnonymous] public Task<OtpSentResponse> Register(RegisterRequest req, CancellationToken ct) => auth.RegisterAsync(req, ct);
//    [HttpPost("verify-otp")][AllowAnonymous] public Task<AuthTokens> Verify(VerifyOtpRequest req, CancellationToken ct) => auth.VerifyOtpAsync(req, ct);
//    [HttpPost("resend-otp")][AllowAnonymous] public Task<OtpSentResponse> Resend(ResendOtpRequest req, CancellationToken ct) => auth.ResendOtpAsync(req.Email, ct);
//    [HttpPost("login")][AllowAnonymous] public Task<AuthTokens> Login(LoginRequest req, CancellationToken ct) => auth.LoginAsync(req, ct);
//    [HttpPost("forgot-password")][AllowAnonymous] public Task<OtpSentResponse> Forgot(ForgotPasswordRequest req, CancellationToken ct) => auth.ForgotPasswordAsync(req, ct);
//    [HttpPost("reset-password")][AllowAnonymous] public async Task<IActionResult> Reset(ResetPasswordRequest req, CancellationToken ct) { await auth.ResetPasswordAsync(req, ct); return NoContent(); }
//}

//// 2
//[Route("api/v1/customer/profile")]
//public sealed class ProfileController(AuthService auth) : CustomerControllerBase
//{
//    [HttpGet] public Task<ProfileDto> Get(CancellationToken ct) => auth.GetProfileAsync(CustomerId, ct);
//    [HttpPut] public Task<ProfileDto> Update(UpdateProfileRequest req, CancellationToken ct) => auth.UpdateProfileAsync(CustomerId, req, ct);
//}

//// 3
