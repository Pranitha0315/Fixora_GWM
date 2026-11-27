using Fixora.Manager.Application.Approvals;
using Fixora.Manager.Application.Billing;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Application.Staff;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Gateways;

/// <summary>Customer-facing gateway: canonical records stay manager-owned; customers only see their own.</summary>
public sealed class WorkshopGateway(
    IManagerDb db,
    BookingService bookings,
    JobService jobs,
    ApprovalWorkflowService approvals,
    ChangeRequestService changes,
    BillingService billing,
    WorkshopSettingsService settings,
    WorkshopReadModel read,
    IClock clock) : IWorkshopGateway
{
    public async Task<GarageDto> GetGarageAsync(CancellationToken ct = default)
    {
        var w = await db.Workshops.AsNoTracking().FirstAsync(ct);
        var open = w.IsOpenAt(clock.UtcNow);
        return new GarageDto(w.Id, w.Name, w.Phone, w.EmergencyPhone, w.Address, w.Lat, w.Lng, w.OpenTime.ToString("HH:mm"), w.CloseTime.ToString("HH:mm"),
            open, open ? null : $"Opens at {w.OpenTime:HH:mm}", w.LoyaltyEnabled, w.LoyaltyPercent, w.LoyaltyCapRupees);
    }

    public Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken ct = default) => settings.ServicesAsync(false, ct);

    public Task<IReadOnlyList<SlotDto>> GetSlotsAsync(DateOnly date, Guid serviceId, CancellationToken ct = default) => bookings.GetSlotsAsync(date, serviceId, ct);

    public async Task<BookingDto> RequestBookingAsync(Guid customerId, string customerName, string vehicleLabel, BookingRequest request, string idempotencyKey, CancellationToken ct = default)
        => (await bookings.RequestAsync(customerId, customerName, vehicleLabel, request, idempotencyKey, ct)).ForCustomer();

    public async Task<IReadOnlyList<BookingDto>> ListBookingsAsync(Guid customerId, CancellationToken ct = default) => (await bookings.ListForCustomerAsync(customerId, ct)).ForCustomer();

    public async Task<BookingDto> CancelBookingAsync(Guid customerId, Guid bookingId, CancellationToken ct = default)
        => (await bookings.CancelAsync(customerId, Roles.Customer, bookingId, ct)).ForCustomer();

    public async Task<BookingDto> RescheduleBookingAsync(Guid customerId, Guid bookingId, DateTime newSlotStart, CancellationToken ct = default)
        => (await bookings.RescheduleAsync(customerId, Roles.Customer, bookingId, newSlotStart, ct)).ForCustomer();

    public async Task<IReadOnlyList<JobSummaryDto>> ListJobsAsync(Guid customerId, bool activeOnly, CancellationToken ct = default)
        => (await jobs.ListAsync(activeOnly, null, customerId, ct)).ForCustomer();

    public Task<JobDetailDto> GetJobAsync(Guid customerId, Guid jobId, CancellationToken ct = default)
        => jobs.GetAsync(jobId, WorkshopReadModel.Viewer.Customer, null, customerId, ct);

    public async Task<QueueEstimateDto> GetQueueEstimateAsync(Guid customerId, Guid jobId, CancellationToken ct = default)
    {
        var job = await db.JobCards.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId && j.CustomerId == customerId, ct) ?? throw new NotFoundException("Job");
        return WorkshopReadModel.Queue(job);
    }

    public async Task<IReadOnlyList<ProposalDto>> ListPendingApprovalsAsync(Guid customerId, CancellationToken ct = default)
    {
        var jobIds = await db.JobCards.AsNoTracking().Where(j => j.CustomerId == customerId).Select(j => j.Id).ToListAsync(ct);
        var ids = await db.Proposals.AsNoTracking().Where(p => jobIds.Contains(p.JobCardId) && p.Status == ProposalStatus.AwaitingCustomer)
            .OrderByDescending(p => p.PublishedAt).Select(p => p.Id).ToListAsync(ct);
        var list = new List<ProposalDto>();
        foreach (var id in ids) list.Add(await read.ProposalAsync(id, false, ct));
        return list.ForCustomer();
    }

    public async Task<ProposalDto> DecideItemsAsync(Guid customerId, Guid proposalId, DecideItemsRequest request, string idempotencyKey, CancellationToken ct = default)
        => (await approvals.DecideAsync(customerId, proposalId, request, idempotencyKey, ct)).ForCustomer();

    public async Task<ChangeRequestDto> CreateChangeRequestAsync(Guid customerId, Guid jobId, ChangeRequestCreate request, CancellationToken ct = default)
        => (await changes.CreateAsync(customerId, jobId, request, ct)).ForCustomer();

    public Task<IReadOnlyList<InvoiceDto>> ListInvoicesAsync(Guid customerId, CancellationToken ct = default) => billing.ListAsync(customerId, null, ct);

    public async Task<IReadOnlyList<ServiceHistoryDto>> GetServiceHistoryAsync(Guid customerId, Guid? vehicleId, CancellationToken ct = default)
    {
        var q = db.JobCards.AsNoTracking().Where(j => j.CustomerId == customerId && (j.Status == JobStatus.Completed || j.Status == JobStatus.Closed));
        if (vehicleId is { } v) q = q.Where(j => j.VehicleId == v);
        var done = await q.OrderByDescending(j => j.CompletedAt).ToListAsync(ct);
        var ids = done.Select(j => j.Id).ToList();
        var items = await db.RepairItems.AsNoTracking().Where(i => ids.Contains(i.JobCardId) && i.Status == RepairItemStatus.Released).ToListAsync(ct);
        var invoices = await db.Invoices.AsNoTracking().Where(i => ids.Contains(i.JobCardId)).ToDictionaryAsync(i => i.JobCardId, i => i.Total, ct);
        return done.Select(j => new ServiceHistoryDto(j.Id, j.Number, j.VehicleId, j.VehicleLabel, j.CompletedAt ?? j.CreatedAt,
            new[] { j.Complaint ?? "Service" }.Concat(items.Where(i => i.JobCardId == j.Id).Select(i => i.Title)).ToList(),
            invoices.GetValueOrDefault(j.Id))).ToList();
    }
}

/// <summary>Mechanic-facing gateway: only jobs assigned to the calling mechanic.</summary>
public sealed class WorkshopJobGateway(IManagerDb db, JobService jobs, ApprovalWorkflowService approvals, ChangeRequestService changes, WorkshopReadModel read) : IWorkshopJobGateway
{
    public Task<IReadOnlyList<JobSummaryDto>> ListAssignedJobsAsync(Guid mechanicId, CancellationToken ct = default) => jobs.ListAsync(false, mechanicId, null, ct);

    public Task<IReadOnlyList<JobSummaryDto>> GetQueueBoardAsync(CancellationToken ct = default) => jobs.ListAsync(true, null, null, ct);

    public Task<JobDetailDto> GetJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
        => jobs.GetAsync(jobId, WorkshopReadModel.Viewer.Mechanic, mechanicId, null, ct);

    public Task<JobSummaryDto> ApplyJobActionAsync(Guid mechanicId, Guid jobId, JobActionRequest request, CancellationToken ct = default)
        => jobs.ApplyMechanicActionAsync(mechanicId, jobId, request, ct);

    public Task<IssueDto> PublishVerifiedIssueAsync(Guid mechanicId, Guid jobId, VerifiedIssueInput issue, CancellationToken ct = default)
        => jobs.AddVerifiedIssueAsync(mechanicId, jobId, issue, ct);

    public Task<ProposalDto> SubmitProposalAsync(Guid mechanicId, Guid jobId, SubmitProposalRequest request, CancellationToken ct = default)
        => approvals.SubmitAsync(mechanicId, jobId, request, ct);

    public async Task<IReadOnlyList<ProposalDto>> ListProposalsAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
    {
        var job = await db.JobCards.AsNoTracking().FirstOrDefaultAsync(j => j.Id == jobId && j.MechanicId == mechanicId, ct) ?? throw new NotFoundException("Job");
        var ids = await db.Proposals.AsNoTracking().Where(p => p.JobCardId == job.Id).OrderByDescending(p => p.SubmittedAt).Select(p => p.Id).ToListAsync(ct);
        var list = new List<ProposalDto>();
        foreach (var id in ids) list.Add(await read.ProposalAsync(id, true, ct));
        return list;
    }

    public Task<ChangeRequestDto> AcknowledgeChangeRequestAsync(Guid mechanicId, Guid changeRequestId, string? note, CancellationToken ct = default)
        => changes.AcknowledgeAsync(mechanicId, changeRequestId, note, ct);

    public async Task<Guid?> GetVehicleIdForJobAsync(Guid mechanicId, Guid jobId, CancellationToken ct = default)
        => await db.JobCards.AsNoTracking().Where(j => j.Id == jobId && j.MechanicId == mechanicId).Select(j => (Guid?)j.VehicleId).FirstOrDefaultAsync(ct);
}

/// <summary>Who may join job:{id}: staff always; the assigned mechanic; the owning customer.</summary>
public sealed class RealtimeAccessPolicy(IManagerDb db) : IRealtimeAccessPolicy
{
    public async Task<bool> CanJoinJobAsync(Guid userId, string role, Guid jobId, CancellationToken ct = default)
    {
        if (Roles.IsStaff(role)) return true;
        return role switch
        {
            Roles.Mechanic => await db.JobCards.AnyAsync(j => j.Id == jobId && j.MechanicId == userId, ct),
            Roles.Customer => await db.JobCards.AnyAsync(j => j.Id == jobId && j.CustomerId == userId, ct),
            _ => false,
        };
    }
}
