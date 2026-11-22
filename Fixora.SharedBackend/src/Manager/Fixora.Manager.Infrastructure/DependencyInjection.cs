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
        services.AddFixoraDbContext<ManagerDbContext>(config);
        services.AddScoped<IManagerDb>(sp => sp.GetRequiredService<ManagerDbContext>());
        services.AddManagerApplication();
        if (config.GetValue("Workers:Enabled", true))
        {
            services.AddHostedService<AdvisorWeeklyWorker>();
            services.AddHostedService<QueueTickWorker>();
        }
        return services;
    }
}
