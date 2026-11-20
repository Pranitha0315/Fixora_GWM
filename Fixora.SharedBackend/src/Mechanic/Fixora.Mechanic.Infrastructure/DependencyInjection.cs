using Fixora.Mechanic.Application;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Mechanic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMechanicModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddMechanicApplication();
        return services;
    }
}
