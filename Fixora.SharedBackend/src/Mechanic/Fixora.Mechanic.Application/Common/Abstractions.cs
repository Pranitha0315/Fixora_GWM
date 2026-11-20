using Fixora.Mechanic.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Mechanic.Application.Common;

/// <summary>Mechanic-owned tables (schema "mechanic"): identity, unverified drafts, capture references.</summary>
public interface IMechanicDb
{
    DbSet<MechanicAccount> Mechanics { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
