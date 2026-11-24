using Fixora.Customer.Application.DriveSense;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Fixora.Customer.Infrastructure.Workers;

/// <summary>Weekly DriveSense aggregation (Sunday 22:00 UTC+5:30 ≈ 16:30 UTC), rules, loyalty, 90-day purge.</summary>
public sealed class DriveSenseWeeklyWorker(IServiceScopeFactory scopes, ILogger<DriveSenseWeeklyWorker> logger) : BackgroundService
{
    private DateOnly? _lastRun;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(now);
            if (now.DayOfWeek != DayOfWeek.Sunday || now.Hour != 16 || _lastRun == today) continue;
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<DriveSenseService>().RunWeeklyAsync(stoppingToken);
                _lastRun = today;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "DriveSense weekly run failed");
            }
        }
    }
}
