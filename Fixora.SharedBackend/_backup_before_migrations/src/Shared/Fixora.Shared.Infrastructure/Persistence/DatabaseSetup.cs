using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Shared.Infrastructure.Persistence;

public static class DatabaseSetup
{
    /// <summary>
    /// Registers a team DbContext against the ONE Fixora SQL Server database.
    /// Set Database:Provider = InMemory to run the demo without SQL Server.
    /// </summary>
    public static IServiceCollection AddFixoraDbContext<TContext>(this IServiceCollection services, IConfiguration config)
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
                options.UseSqlServer(connectionString);
        });
        return services;
    }

    /// <summary>
    /// Several bounded-context DbContexts share one database, each in its own schema.
    /// EnsureCreated only works for the first context, so each context creates its own
    /// tables when its schema is still empty. Replace with EF migrations for production
    /// (see database/README.md).
    /// </summary>
    public static async Task EnsureSchemaAsync(this DbContext db, string schema, CancellationToken ct = default)
    {
        if (!db.Database.IsRelational())
        {
            await db.Database.EnsureCreatedAsync(ct);
            return;
        }

        var creator = db.GetService<IRelationalDatabaseCreator>();
        if (!await creator.ExistsAsync(ct))
            await creator.CreateAsync(ct);

        var tables = await db.Database
            .SqlQuery<int>($"SELECT COUNT(*) AS [Value] FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = {schema}")
            .SingleAsync(ct);

        if (tables == 0)
            await creator.CreateTablesAsync(ct);
    }
}
