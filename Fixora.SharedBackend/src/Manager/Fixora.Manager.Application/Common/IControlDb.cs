using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Manager / Auto mode tables (schema "control"). Their own schema so an existing
/// database gets them on the next start without touching the workshop tables.</summary>
public interface IControlDb
{
    DbSet<ControlSettings> ControlSettings { get; }
    DbSet<AutoActionLog> AutoActions { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
