using Fixora.Manager.Application;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Manager.Infrastructure.Workers;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Manager.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddManagerModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddFixoraDbContext<ManagerDbContext>(config, ManagerDbContext.Schema);
        services.AddScoped<IManagerDb>(sp => sp.GetRequiredService<ManagerDbContext>());
        services.AddFixoraDbContext<ControlDbContext>(config, ControlDbContext.Schema);
        services.AddScoped<IControlDb>(sp => sp.GetRequiredService<ControlDbContext>());
        services.AddManagerApplication();
        if (config.GetValue("Workers:Enabled", true))
        {
            services.AddHostedService<AdvisorWeeklyWorker>();
            services.AddHostedService<QueueTickWorker>();
            services.AddHostedService<AutoPilotWorker>();
        }
        return services;
    }
}
