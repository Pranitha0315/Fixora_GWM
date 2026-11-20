using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Manager.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddManagerApplication(this IServiceCollection services)
    {
        services.AddScoped<StaffAuthService>();
        services.AddScoped<InvitationService>();
        services.AddScoped<IInvitationGateway>(sp => sp.GetRequiredService<InvitationService>());
        return services;
    }
}
