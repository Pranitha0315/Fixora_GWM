using Fixora.Shared.Contracts;
using Microsoft.AspNetCore.Http;

namespace Fixora.Shared.Infrastructure.Security;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid UserId => Guid.TryParse(Principal?.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

    public string Role => Principal?.FindFirst("role")?.Value ?? "";

    public string Name => Principal?.FindFirst("name")?.Value ?? "";
}
