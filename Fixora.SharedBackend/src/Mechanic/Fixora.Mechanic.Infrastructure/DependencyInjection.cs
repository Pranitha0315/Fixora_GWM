using Fixora.Mechanic.Application;
using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Infrastructure.Ai;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Mechanic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMechanicModule(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AiOptions>(config.GetSection("Ai"));
        services.AddFixoraDbContext<MechanicDbContext>(config, MechanicDbContext.Schema);
        services.AddScoped<IMechanicDb>(sp => sp.GetRequiredService<MechanicDbContext>());
        services.AddSingleton<TemplateInspectionDrafter>();
        services.AddSingleton<ISpeechToText, NullSpeechToText>();
        if (string.Equals(config["Ai:Provider"], "Anthropic", StringComparison.OrdinalIgnoreCase))
            services.AddHttpClient<IInspectionDrafter, AnthropicInspectionDrafter>();
        else
            services.AddSingleton<IInspectionDrafter>(sp => sp.GetRequiredService<TemplateInspectionDrafter>());
        services.AddMechanicApplication();
        return services;
    }
}
