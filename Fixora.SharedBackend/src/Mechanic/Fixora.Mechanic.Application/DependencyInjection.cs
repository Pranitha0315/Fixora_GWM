using Fixora.Mechanic.Application.Auth;
using Fixora.Mechanic.Application.Jobs;
using Fixora.Mechanic.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Mechanic.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddMechanicApplication(this IServiceCollection services)
    {
        services.AddScoped<MechanicAuthService>();
        services.AddScoped<MechanicJobService>();
        services.AddScoped<IMechanicDirectory, MechanicDirectory>();
        return services;
    }
}
