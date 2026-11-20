using Fixora.Mechanic.Application;
using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Mechanic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMechanicModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddFixoraDbContext<MechanicDbContext>(config);
        services.AddScoped<IMechanicDb>(sp => sp.GetRequiredService<MechanicDbContext>());
        services.AddMechanicApplication();
        return services;
    }
}
