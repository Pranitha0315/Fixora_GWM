using System.Text.Json.Serialization;
using Fixora.Customer.Api.Controllers;
using Fixora.Customer.Infrastructure;
using Fixora.Customer.Infrastructure.Persistence;
using Fixora.Manager.Api.Controllers;
using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Infrastructure;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Api.Controllers;
using Fixora.Mechanic.Infrastructure;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure;
using Fixora.Shared.Infrastructure.Api;
using Fixora.Shared.Infrastructure.Persistence;
using Fixora.Shared.Infrastructure.Realtime;
using Fixora.Shared.Infrastructure.Web;
using Fixora.SharedKernel;
using Fixora.Host;
using Serilog;

// ─────────────────────────────────────────────────────────────────────────────
//  FIXORA — ONE backend for the customer app, Fixora Rev (mechanic) and the
//  manager web. Three team-owned API surfaces + one SignalR hub + one SQL Server.
//     /api/v1/customer/*   Fixora.Customer.Api
//     /api/v1/mechanic/*   Fixora.Mechanic.Api
//     /api/v1/manager/*    Fixora.Manager.Api
//     /api/v1/notifications, /api/v1/auth/refresh, /api/v1/media  (shared)
//     /hubs/fixora         realtime (notifications + approval/job/queue/SOS events)
// ─────────────────────────────────────────────────────────────────────────────

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Host.UseSerilog((ctx, lc) => lc
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {CorrelationId} {Message:lj}{NewLine}{Exception}"));

builder.Services.AddFixoraShared(config);
builder.Services.AddCustomerModule(config);
builder.Services.AddMechanicModule(config);
builder.Services.AddManagerModule(config);

builder.Services.AddControllers()
    .AddApplicationPart(typeof(CustomerControllerBase).Assembly)
    .AddApplicationPart(typeof(MechanicControllerBase).Assembly)
    .AddApplicationPart(typeof(StaffControllerBase).Assembly)
    .AddApplicationPart(typeof(NotificationsController).Assembly)
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

var origins = config.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddPolicy("apps", p =>
{
    if (origins.Length == 0) p.SetIsOriginAllowed(_ => true); // development: any origin (Flutter web, Angular dev server)
    else p.WithOrigins(origins);
    p.AllowAnyHeader().AllowAnyMethod().AllowCredentials().WithExposedHeaders(CorrelationIdMiddleware.Header);
}));

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseSerilogRequestLogging();
app.UseCors("apps");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<FixoraHub>("/hubs/fixora");
app.MapOpenApi();
app.MapFixoraSwagger();   // Swagger UI → http://localhost:5080/swagger
app.MapHealthChecks("/health");
app.MapGet("/", () => Results.Ok(new
{
    name = "Fixora API",
    version = "1.0.0",
    surfaces = new[] { "/api/v1/customer", "/api/v1/mechanic", "/api/v1/manager" },
    realtime = "/hubs/fixora",
    openApi = "/openapi/v1.json",
    swagger = "/swagger",
}));

await InitialiseDatabaseAsync(app);
app.Run();

static async Task InitialiseDatabaseAsync(WebApplication app)
{
    await using var scope = app.Services.CreateAsyncScope();
    var sp = scope.ServiceProvider;
    var cfg = sp.GetRequiredService<IConfiguration>();
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("Database");

    // One SQL Server, one schema per owner (shared / customer / mechanic / workshop).
    await sp.GetRequiredService<SharedDbContext>().EnsureSchemaAsync(SharedDbContext.Schema);
    await sp.GetRequiredService<CustomerDbContext>().EnsureSchemaAsync(CustomerDbContext.Schema);
    await sp.GetRequiredService<MechanicDbContext>().EnsureSchemaAsync(MechanicDbContext.Schema);
    await sp.GetRequiredService<ManagerDbContext>().EnsureSchemaAsync(ManagerDbContext.Schema);
    await sp.GetRequiredService<ControlDbContext>().EnsureSchemaAsync(ControlDbContext.Schema);   // Manager / Auto mode

    if (cfg.GetValue("Database:Seed", true))
    {
        var passwords = sp.GetRequiredService<IPasswordService>();
        var clock = sp.GetRequiredService<IClock>();
        await CustomerSeeder.SeedAsync(sp.GetRequiredService<CustomerDbContext>(), passwords, clock);
        await MechanicSeeder.SeedAsync(sp.GetRequiredService<MechanicDbContext>(), passwords);
        await ManagerSeeder.SeedAsync(sp.GetRequiredService<ManagerDbContext>(), passwords, clock);
        await sp.GetRequiredService<QueueService>().RecalculateAsync();
        // First run: compute this week's Smart Advisor briefing so the dashboard opens with the planted insights.
        var advisor = sp.GetRequiredService<AdvisorService>();
        if ((await advisor.GetBriefingAsync()).Insights.Count == 0) await advisor.RunWeeklyAsync();
        logger.LogInformation("Demo garage seeded (see DemoIds for logins)");
    }
}

public partial class Program { }
