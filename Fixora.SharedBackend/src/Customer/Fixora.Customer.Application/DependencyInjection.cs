using Fixora.Customer.Application.Auth;
using Fixora.Customer.Application.Common;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Customer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddCustomerApplication(this IServiceCollection services)
    {
        services.AddScoped<AuthService>();
        return services;
    }
}
