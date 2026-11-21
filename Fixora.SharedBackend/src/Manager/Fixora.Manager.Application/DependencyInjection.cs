using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Gateways;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Manager.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddManagerApplication(this IServiceCollection services)
    {
        services.AddScoped<WorkshopReadModel>();
        services.AddScoped<BookingService>();
        services.AddScoped<StaffAuthService>();
        services.AddScoped<InvitationService>();
        services.AddScoped<WorkshopSettingsService>();
        services.AddScoped<MechanicRosterService>();

        services.AddScoped<IWorkshopGateway, WorkshopGateway>();
        services.AddScoped<IInvitationGateway>(sp => sp.GetRequiredService<InvitationService>());
        return services;
    }
}
