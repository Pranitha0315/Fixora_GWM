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
        // FX13-D06-NID-1: server speech-to-text. "Gemini" = Gemini STT; anything else = none (app sends typed / device text).
        if (string.Equals(config["Stt:Provider"], "Gemini", StringComparison.OrdinalIgnoreCase))
            services.AddHttpClient<ISpeechToText, GeminiSpeechToText>();
        else
            services.AddSingleton<ISpeechToText, NullSpeechToText>();
        // FX13-D06-NID-2: FixProof draft. Gemini / Anthropic with template fallback; default = template only.
        if (string.Equals(config["Ai:Provider"], "Gemini", StringComparison.OrdinalIgnoreCase))
            services.AddHttpClient<IInspectionDrafter, GeminiInspectionDrafter>();
        else if (string.Equals(config["Ai:Provider"], "Anthropic", StringComparison.OrdinalIgnoreCase))
            services.AddHttpClient<IInspectionDrafter, AnthropicInspectionDrafter>();
        else
            services.AddSingleton<IInspectionDrafter>(sp => sp.GetRequiredService<TemplateInspectionDrafter>());
        services.AddMechanicApplication();
        return services;
    }
}
