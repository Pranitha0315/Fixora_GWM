using System.Transactions;
using Fixora.Shared.Contracts;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Shared.Infrastructure.Persistence;

/// <summary>
/// Runs work inside one ambient transaction so Manager and Mechanic DbContexts
/// (separate connections, same SQL Server database) commit or roll back together.
/// InMemory / non-relational providers skip the transaction (demo mode only).
/// </summary>
public sealed class CrossContextTransaction<TPrimary, TSecondary>(TPrimary primary, TSecondary secondary)
    : IFixoraTransaction
    where TPrimary : DbContext
    where TSecondary : DbContext
{
    public Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default)
        => ExecuteAsync(async token =>
        {
            await operation(token);
            return true;
        }, ct);

    public async Task<T> ExecuteAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken ct = default)
    {
        // Both contexts must be relational; SaveChanges on either enlists in the ambient scope.
        if (!primary.Database.IsRelational() || !secondary.Database.IsRelational())
            return await operation(ct);

        var strategy = primary.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            using var scope = new TransactionScope(
                TransactionScopeOption.Required,
                new TransactionOptions { IsolationLevel = IsolationLevel.ReadCommitted },
                TransactionScopeAsyncFlowOption.Enabled);

            var result = await operation(ct);
            scope.Complete();
            return result;
        });
    }
}
