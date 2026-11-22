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
    DbSet<InspectionIssue> Issues { get; }
    DbSet<RepairProposal> Proposals { get; }
    DbSet<RepairItem> RepairItems { get; }
    DbSet<ApprovalDecisionRecord> ApprovalDecisions { get; }
    DbSet<ApprovalAuditEntry> ApprovalAudit { get; }
    DbSet<CustomerChangeRequest> ChangeRequests { get; }
    DbSet<Invoice> Invoices { get; }
    DbSet<InvoiceLine> InvoiceLines { get; }
    DbSet<Part> Parts { get; }
    DbSet<StockMovement> StockMovements { get; }
    DbSet<PartsOrder> PartsOrders { get; }
    DbSet<EarningsEntry> Earnings { get; }

    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
