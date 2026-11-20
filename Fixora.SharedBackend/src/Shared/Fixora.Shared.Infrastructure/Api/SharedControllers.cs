using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

// Every controller in this assembly binds JSON bodies and returns ProblemDetails-style 400s.
[assembly: Microsoft.AspNetCore.Mvc.ApiController]

namespace Fixora.Shared.Infrastructure.Api;

public sealed record RefreshRequest(string RefreshToken);

[ApiController]
[Route("api/v1/auth")]
public sealed class SessionController(ITokenService tokens) : ControllerBase
{
    /// <summary>Rotates a refresh token for any role.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public Task<AuthTokens> Refresh(RefreshRequest req, CancellationToken ct) => tokens.RefreshAsync(req.RefreshToken, ct);

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout(RefreshRequest req, CancellationToken ct)
    {
        await tokens.RevokeAsync(req.RefreshToken, ct);
        return NoContent();
    }
}
