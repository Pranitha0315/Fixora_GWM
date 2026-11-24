using System.Text;
using System.Threading.RateLimiting;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Media;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Realtime;
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

public static class RateLimitPolicies
{
    public const string Auth = "auth";
    public const string Sos = "sos";
}

public static class DependencyInjection
{
    public static IServiceCollection AddFixoraShared(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<JwtOptions>(config.GetSection("Jwt"));
        var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();

        services.AddHttpContextAccessor();
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<StaffPresence>();
        services.AddSingleton<IStaffPresence>(sp => sp.GetRequiredService<StaffPresence>());
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddSingleton<IPushSender, LoggingPushSender>();
        services.AddSingleton<IMediaStorage, LocalMediaStorage>();
        services.AddFixoraDbContext<SharedDbContext>(config, SharedDbContext.Schema);

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "name",
                    RoleClaimType = "role",
                };
                // SignalR sends the JWT as ?access_token= for WebSockets / SSE.
                o.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var token = ctx.Request.Query["access_token"];
                        if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                            ctx.Token = token;
                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(Policies.Customer, p => p.RequireClaim("role", Roles.Customer))
            .AddPolicy(Policies.Mechanic, p => p.RequireClaim("role", Roles.Mechanic))
            .AddPolicy(Policies.Staff, p => p.RequireClaim("role", Roles.Manager, Roles.Owner, Roles.PlatformAdmin))
            .AddPolicy(Policies.Owner, p => p.RequireClaim("role", Roles.Owner, Roles.PlatformAdmin));

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            // Partitioned per caller (user id, else IP) so one customer cannot exhaust another's quota.
            o.AddPolicy(RateLimitPolicies.Auth, ctx => RateLimitPartition.GetFixedWindowLimiter(
                PartitionKey(ctx), _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
            o.AddPolicy(RateLimitPolicies.Sos, ctx => RateLimitPartition.GetFixedWindowLimiter(
                PartitionKey(ctx), _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
        });

        services.AddSignalR();
        return services;
    }

    private static string PartitionKey(HttpContext ctx)
        => ctx.User.FindFirst("sub")?.Value ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous";
}
