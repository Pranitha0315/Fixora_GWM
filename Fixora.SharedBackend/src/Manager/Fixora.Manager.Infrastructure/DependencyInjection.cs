using Fixora.Manager.Application;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Manager.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddManagerModule(this IServiceCollection services, IConfiguration config)
    {
        services.AddManagerApplication();
        return services;
    }
}
