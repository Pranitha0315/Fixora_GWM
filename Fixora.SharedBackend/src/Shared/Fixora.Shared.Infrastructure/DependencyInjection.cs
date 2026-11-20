using System.Text;
using System.Threading.RateLimiting;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Security;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Fixora.Shared.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddFixoraShared(this IServiceCollection services, IConfiguration config)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<ICurrentUser, CurrentUser>();

        return services;
    }
}
