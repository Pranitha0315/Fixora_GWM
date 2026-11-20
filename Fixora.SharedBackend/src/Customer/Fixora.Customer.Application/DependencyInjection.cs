using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Customer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddCustomerApplication(this IServiceCollection services)
    {
        return services;
    }
}
