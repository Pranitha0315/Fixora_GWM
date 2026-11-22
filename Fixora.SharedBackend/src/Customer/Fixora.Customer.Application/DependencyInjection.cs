using Fixora.Customer.Application.Auth;
using Fixora.Customer.Application.Common;
using Fixora.Customer.Application.DriveSense;
using Fixora.Customer.Application.Vehicles;
using Fixora.Customer.Application.Workshop;
using Fixora.Customer.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Customer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddCustomerApplication(this IServiceCollection services)
    {
        services.AddScoped<AuthService>();
        services.AddScoped<VehicleService>();
        services.AddScoped<DriveSenseService>();
        services.AddScoped<CustomerDirectory>();
        services.AddScoped<ICustomerDirectory>(sp => sp.GetRequiredService<CustomerDirectory>());
        services.AddScoped<CustomerWorkshopService>();
        return services;
    }
}
