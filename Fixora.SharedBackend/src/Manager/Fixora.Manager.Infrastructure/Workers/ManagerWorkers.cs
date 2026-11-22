using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Fixora.Manager.Infrastructure.Workers;

/// <summary>
/// Smart Advisor scheduler: Sunday 23:00 (workshop local time) computes the weekly snapshot,
/// runs the detectors and notifies staff. A Hangfire recurring job can replace this in production.
/// </summary>
public sealed class AdvisorWeeklyWorker(IServiceScopeFactory scopes, ILogger<AdvisorWeeklyWorker> logger) : BackgroundService
{
    private DateOnly? _lastRun;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
                var workshop = await db.Workshops.AsNoTracking().FirstOrDefaultAsync(stoppingToken);
                if (workshop is null) continue;
                var local = workshop.ToLocal(DateTime.UtcNow);
                var today = DateOnly.FromDateTime(local);
                if (local.DayOfWeek != DayOfWeek.Sunday || local.Hour != 23 || _lastRun == today) continue;

                await scope.ServiceProvider.GetRequiredService<AdvisorService>().RunWeeklyAsync(stoppingToken);
                _lastRun = today;
                logger.LogInformation("Weekly Smart Advisor briefing generated");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Advisor run failed; it will retry next minute"); // NFR-09 retry
            }
        }
    }
}

/// <summary>Keeps indicative ETAs fresh while jobs run (elapsed time changes every minute).</summary>
public sealed class QueueTickWorker(IServiceScopeFactory scopes, ILogger<QueueTickWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(2));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
                if (!await db.JobCards.AnyAsync(j => j.Status != JobStatus.Completed && j.Status != JobStatus.Closed, stoppingToken)) continue;
                await scope.ServiceProvider.GetRequiredService<QueueService>().RecalculateAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Queue tick failed");
            }
        }
    }
}

/// <summary>
/// Manager mode / Auto mode loop: every 5 seconds it checks whether a manager is online and,
/// while Auto mode is in effect, moves approvals, change requests, bookings and SOS along.
/// </summary>
public sealed class AutoPilotWorker(IServiceScopeFactory scopes, ILogger<AutoPilotWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<Fixora.Manager.Application.Control.AutoPilotService>().TickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Auto mode tick failed; it will retry in 5 seconds");
            }
        }
    }
}
