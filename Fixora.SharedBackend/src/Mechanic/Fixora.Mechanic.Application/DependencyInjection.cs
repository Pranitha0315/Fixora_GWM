using Fixora.Mechanic.Application.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Mechanic.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddMechanicApplication(this IServiceCollection services)
    {
        services.AddScoped<MechanicAuthService>();
        return services;
    }
}
