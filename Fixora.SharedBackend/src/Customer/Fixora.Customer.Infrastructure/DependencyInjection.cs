using Fixora.Customer.Application;
using Fixora.Customer.Application.Common;
using Fixora.Customer.Infrastructure.Persistence;
using Fixora.Customer.Infrastructure.Services;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Customer.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCustomerModule(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<CustomerOptions>(config.GetSection("Customer"));
        services.AddFixoraDbContext<CustomerDbContext>(config);
        services.AddScoped<ICustomerDb>(sp => sp.GetRequiredService<CustomerDbContext>());
        services.AddSingleton<IEmailSender, LoggingEmailSender>();
        services.AddCustomerApplication();
        return services;
    }
}
