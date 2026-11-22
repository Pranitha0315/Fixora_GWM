using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Application.Approvals;
using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Gateways;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Application.Jobs;
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
        services.AddScoped<QueueService>();
        services.AddScoped<InventoryService>();
        services.AddScoped<BillingService>();
        services.AddScoped<JobService>();
        services.AddScoped<BookingService>();
        services.AddScoped<ApprovalWorkflowService>();
        services.AddScoped<ChangeRequestService>();
        services.AddScoped<StaffAuthService>();
        services.AddScoped<InvitationService>();
        services.AddScoped<WorkshopSettingsService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<MechanicRosterService>();
        services.AddScoped<AdvisorService>();
        services.AddSingleton<Control.AutoPilotState>();
        services.AddScoped<Control.AutoPilotService>();

        services.AddScoped<IWorkshopGateway, WorkshopGateway>();
        services.AddScoped<IWorkshopJobGateway, WorkshopJobGateway>();
        services.AddScoped<IInvitationGateway>(sp => sp.GetRequiredService<InvitationService>());
        services.AddScoped<IRealtimeAccessPolicy, RealtimeAccessPolicy>();
        return services;
    }
}
