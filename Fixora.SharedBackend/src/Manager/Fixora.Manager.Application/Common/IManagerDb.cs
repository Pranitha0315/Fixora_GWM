using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Manager-owned tables (schema "workshop"). Implemented by ManagerDbContext.</summary>
public interface IManagerDb
{
    DbSet<StaffUser> Staff { get; }
    DbSet<MechanicInvitation> Invitations { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
