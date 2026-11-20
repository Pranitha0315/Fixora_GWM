using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

/// <summary>Manager-owned tables (schema "workshop"). Implemented by ManagerDbContext.</summary>
public interface IManagerDb
{
    DbSet<Workshop> Workshops { get; }
    DbSet<Bay> Bays { get; }
    DbSet<ServiceItem> Services { get; }
    DbSet<StaffUser> Staff { get; }
    DbSet<MechanicInvitation> Invitations { get; }
    DbSet<Appointment> Appointments { get; }
    DbSet<JobCard> JobCards { get; }
    DbSet<ProgressUpdate> ProgressUpdates { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
