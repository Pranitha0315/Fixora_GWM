using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Fixora.Manager.Infrastructure.Workers;

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
