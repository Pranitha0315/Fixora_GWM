using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Manager.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddManagerApplication(this IServiceCollection services)
    {
        return services;
    }
}
