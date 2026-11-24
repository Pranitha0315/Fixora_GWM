using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Shared.Infrastructure.Persistence;

public static class DatabaseSetup
{
    /// <summary>
    /// Registers a team DbContext against the ONE Fixora SQL Server database.
    /// Each context keeps its own EF Core migrations history table inside its own schema
    /// (shared.__EFMigrationsHistory, customer.__EFMigrationsHistory, ...).
    /// Set Database:Provider = InMemory to run the demo without SQL Server.
    /// </summary>
    public static IServiceCollection AddFixoraDbContext<TContext>(this IServiceCollection services, IConfiguration config, string schema)
        where TContext : DbContext
    {
        var provider = config["Database:Provider"] ?? "SqlServer";
        var connectionString = config.GetConnectionString("Fixora")
            ?? "Server=localhost,1433;Database=FixoraDb;User Id=sa;Password=Fixora#2026;TrustServerCertificate=True";

        services.AddDbContext<TContext>(options =>
        {
            if (provider.Equals("InMemory", StringComparison.OrdinalIgnoreCase))
                options.UseInMemoryDatabase(config["Database:InMemoryName"] ?? "fixora");
            else
                options.UseSqlServer(connectionString,
                    sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", schema));
        });
        return services;
    }

    /// <summary>
    /// SQL Server: apply this context's EF Core migrations (creates the database on first run).
    /// In-memory demo / tests: just create the tables.
    /// </summary>
    public static async Task MigrateOrCreateAsync(this DbContext db, CancellationToken ct = default)
    {
        if (db.Database.IsRelational())
            await db.Database.MigrateAsync(ct);
        else
            await db.Database.EnsureCreatedAsync(ct);
    }
}
