using System.Security.Cryptography;
using Fixora.Customer.Contracts;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Mechanic.Contracts;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Staff;

public sealed record InvitationListDto(
    Guid Id, string Name, string Phone, DateTime ExpiresAt, string Status);

public sealed record StaffLoginRequest(string Email, string Password);
public sealed record CreateInvitationRequest(string Name, string Phone);

public sealed record InvitationDto(
    Guid Id, string Name, string Phone, string Token,
    string Link, DateTime ExpiresAt, string Status);

public sealed record WorkshopSettingsDto(
    string Name, string Phone, string EmergencyPhone, string Address,
    string OpenTime, string CloseTime, int SlotMinutes,
    int CancelCutoffHours, int EtaShiftNotifyMinutes,
    bool LoyaltyEnabled, decimal LoyaltyPercent, decimal LoyaltyCapRupees);

public sealed record BayDto(Guid Id, string Name, bool Active);

public sealed record ServiceUpsert(
    string Name, string Category, int StandardMinutes,
    decimal BasePrice, bool Active);

public sealed record DashboardDto(
    int TodayBookings, int PendingBookings, int ActiveJobs,
    int ProposalsToReview, int ApprovalsToRelease,
    int ChangeRequestsToReview, int OpenSos, int LowStockParts,
    int UnpaidInvoices, decimal RevenueThisWeek,
    decimal RevenueLastWeek, decimal PlatformEarningsThisMonth);

public sealed class StaffAuthService(
    IManagerDb db,
    IPasswordService passwords,
    ITokenService tokens)
{
    public async Task<AuthTokens> LoginAsync(
        StaffLoginRequest req,
        CancellationToken ct = default)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();

        var staff = await db.Staff
            .FirstOrDefaultAsync(s => s.Email == email, ct);

        if (staff is null ||
            !passwords.Verify(staff.PasswordHash, req.Password ?? ""))
        {
            throw new UnauthorizedAppException();
        }

        return await tokens.IssueAsync(
            staff.Id, staff.Role, staff.Name, ct);
    }
}

/// <summary>Manager-issued 7-day mechanic invitations.</summary>
public sealed class InvitationService(
    IManagerDb db,
    IClock clock,
    IMechanicDirectory mechanics) : IInvitationGateway
{
    public const int ValidDays = 7;

    public async Task<InvitationDto> CreateAsync(
        Guid staffId,
        CreateInvitationRequest req,
        CancellationToken ct = default)
    {
        Guard.Against(
            string.IsNullOrWhiteSpace(req.Name) ||
            string.IsNullOrWhiteSpace(req.Phone),
            "Name and phone are required.");

        var token = Convert.ToHexString(
            RandomNumberGenerator.GetBytes(5));

        var now = clock.UtcNow;

        var inv = new MechanicInvitation
        {
            Name = req.Name.Trim(),
            Phone = req.Phone.Trim(),
            Token = token,
            CreatedBy = staffId,
            CreatedAt = now,
            ExpiresAt = now.AddDays(ValidDays)
        };

        db.Invitations.Add(inv);
        await db.SaveChangesAsync(ct);

        return ToDto(inv);
    }

    public async Task<IReadOnlyList<InvitationListDto>> ListAsync(
        CancellationToken ct = default)
    {
        var now = clock.UtcNow;

        var invitations = await db.Invitations
            .AsNoTracking()
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);

        return invitations.Select(i => new InvitationListDto(
            i.Id,
            i.Name,
            i.Phone,
            i.ExpiresAt,
            i.AcceptedAt is not null
                ? "Accepted"
                : i.RevokedAt is not null
                    ? "Revoked"
                    : i.ExpiresAt <= now
                        ? "Expired"
                        : "Pending"))
            .ToList();
    }

    public async Task RevokeAsync(
        Guid id,
        CancellationToken ct = default)
    {
        var inv = await db.Invitations
            .FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new NotFoundException("Invitation");

        if (inv.AcceptedAt is not null)
        {
            throw new ConflictException(
                "invitation_already_accepted",
                "An accepted invitation cannot be revoked. Manage the mechanic account separately.");
        }

        // Repeated revocation preserves the original timestamp.
        if (inv.RevokedAt is not null)
        {
            return;
        }

        inv.RevokedAt = clock.UtcNow;
        inv.Version++;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException) when (db is DbContext ctx)
        {
            await ctx.Entry(inv).ReloadAsync(ct);

            if (ctx.Entry(inv).State == EntityState.Detached)
            {
                throw new NotFoundException("Invitation");
            }

            if (inv.AcceptedAt is not null)
            {
                throw new ConflictException(
                    "invitation_already_accepted",
                    "An accepted invitation cannot be revoked. Manage the mechanic account separately.");
            }

            if (inv.RevokedAt is not null)
            {
                return;
            }

            throw new ConflictException(
                "invitation_state_changed",
                "The invitation changed while revoking. Refresh and try again.");
        }
    }

    public async Task<InvitationInfo?> FindValidAsync(
        string token,
        CancellationToken ct = default)
    {
        var t = (token ?? "").Trim().ToUpperInvariant();

        var inv = await db.Invitations
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Token == t, ct);

        return inv is not null && inv.IsValid(clock.UtcNow)
            ? new InvitationInfo(
                inv.Id, inv.Name, inv.Phone, inv.ExpiresAt)
            : null;
    }

    public async Task MarkAcceptedAsync(
        Guid invitationId,
        Guid mechanicId,
        CancellationToken ct = default)
    {
        Guard.Against(
            mechanicId == Guid.Empty,
            "A valid mechanic account ID is required.");

        var account = await mechanics.GetAsync(mechanicId, ct)
            ?? throw new NotFoundException("Mechanic");

        if (!account.Active)
        {
            throw new ConflictException(
                "mechanic_inactive",
                "Only an active mechanic account can accept an invitation.");
        }

        var inv = await db.Invitations
            .FirstOrDefaultAsync(i => i.Id == invitationId, ct)
            ?? throw new NotFoundException("Invitation");

        if (inv.AcceptedAt is not null)
        {
            if (inv.MechanicId == mechanicId)
            {
                return;
            }

            throw new ConflictException(
                "invitation_already_accepted",
                "This invitation is already linked to another mechanic account.");
        }

        var now = clock.UtcNow;

        if (!inv.IsValid(now))
        {
            throw new AppException(
                410,
                "invite_expired",
                "This invitation has expired or was revoked. Ask the manager for a new one.");
        }

        if (inv.MechanicId is not null &&
            inv.MechanicId != mechanicId)
        {
            throw new ConflictException(
                "invitation_account_mismatch",
                "This invitation is already linked to another mechanic account.");
        }

        inv.AcceptedAt = now;
        inv.MechanicId = mechanicId;
        inv.Version++;

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException) when (db is DbContext ctx)
        {
            await ctx.Entry(inv).ReloadAsync(ct);

            if (ctx.Entry(inv).State == EntityState.Detached)
            {
                throw new NotFoundException("Invitation");
            }

            // Preserve successful repeated acceptance, even after expiry.
            if (inv.AcceptedAt is not null)
            {
                if (inv.MechanicId == mechanicId)
                {
                    return;
                }

                throw new ConflictException(
                    "invitation_already_accepted",
                    "This invitation is already linked to another mechanic account.");
            }

            if (inv.RevokedAt is not null ||
                inv.ExpiresAt <= clock.UtcNow)
            {
                throw new AppException(
                    410,
                    "invite_expired",
                    "This invitation has expired or was revoked. Ask the manager for a new one.");
            }

            throw new ConflictException(
                "invitation_state_changed",
                "The invitation changed while accepting. Refresh and try again.");
        }
    }

    private InvitationDto ToDto(MechanicInvitation i) => new(
        i.Id,
        i.Name,
        i.Phone,
        i.Token,
        $"fixorarev://join?token={i.Token}",
        i.ExpiresAt,
        i.AcceptedAt is not null
            ? "Accepted"
            : i.RevokedAt is not null
                ? "Revoked"
                : i.ExpiresAt <= clock.UtcNow
                    ? "Expired"
                    : "Pending");
}

public sealed class WorkshopSettingsService(IManagerDb db)
{
    public async Task<WorkshopSettingsDto> GetAsync(
        CancellationToken ct = default)
        => ToDto(await db.Workshops.AsNoTracking().FirstAsync(ct));

    public async Task<WorkshopSettingsDto> UpdateAsync(
        WorkshopSettingsDto req,
        CancellationToken ct = default)
    {
        var w = await db.Workshops.FirstAsync(ct);

        var validHours = TimeOnly.TryParse(req.OpenTime, out var open)
            & TimeOnly.TryParse(req.CloseTime, out var close);

        Guard.Against(
            !validHours || close <= open,
            "Opening hours are not valid.");

        Guard.Against(
            req.LoyaltyPercent is < 0 or > 20,
            "Loyalty percentage must be between 0 and 20.");

        w.Name = req.Name;
        w.Phone = req.Phone;
        w.EmergencyPhone = req.EmergencyPhone;
        w.Address = req.Address;
        w.OpenTime = open;
        w.CloseTime = close;
        w.SlotMinutes = Math.Clamp(req.SlotMinutes, 15, 240);
        w.CancelCutoffHours = Math.Clamp(req.CancelCutoffHours, 0, 72);
        w.EtaShiftNotifyMinutes = Math.Clamp(
            req.EtaShiftNotifyMinutes, 5, 120);
        w.LoyaltyEnabled = req.LoyaltyEnabled;
        w.LoyaltyPercent = req.LoyaltyPercent;
        w.LoyaltyCapRupees = Math.Max(0, req.LoyaltyCapRupees);

        await db.SaveChangesAsync(ct);

        return ToDto(w);
    }

    public async Task<IReadOnlyList<BayDto>> BaysAsync(
        CancellationToken ct = default)
        => await db.Bays
            .AsNoTracking()
            .OrderBy(b => b.SortOrder)
            .Select(b => new BayDto(b.Id, b.Name, b.Active))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<ServiceDto>> ServicesAsync(
        bool includeInactive,
        CancellationToken ct = default)
        => await db.Services
            .AsNoTracking()
            .Where(s => includeInactive || s.Active)
            .OrderBy(s => s.Category)
            .ThenBy(s => s.Name)
            .Select(s => new ServiceDto(
                s.Id, s.Name, s.Category,
                s.StandardMinutes, s.BasePrice))
            .ToListAsync(ct);

    public async Task<ServiceDto> UpsertServiceAsync(
        Guid? id,
        ServiceUpsert req,
        CancellationToken ct = default)
    {
        Guard.Against(
            string.IsNullOrWhiteSpace(req.Name) ||
            req.StandardMinutes <= 0,
            "Name and duration are required.");

        ServiceItem s;

        if (id is null)
        {
            s = new ServiceItem();
            db.Services.Add(s);
        }
        else
        {
            s = await db.Services
                .FirstOrDefaultAsync(x => x.Id == id, ct)
                ?? throw new NotFoundException("Service");
        }

        s.Name = req.Name;
        s.Category = req.Category;
        s.StandardMinutes = req.StandardMinutes;
        s.BasePrice = req.BasePrice;
        s.Active = req.Active;

        await db.SaveChangesAsync(ct);

        return new ServiceDto(
            s.Id, s.Name, s.Category,
            s.StandardMinutes, s.BasePrice);
    }

    public static WorkshopSettingsDto ToDto(Workshop w) => new(
        w.Name,
        w.Phone,
        w.EmergencyPhone,
        w.Address,
        w.OpenTime.ToString("HH:mm"),
        w.CloseTime.ToString("HH:mm"),
        w.SlotMinutes,
        w.CancelCutoffHours,
        w.EtaShiftNotifyMinutes,
        w.LoyaltyEnabled,
        w.LoyaltyPercent,
        w.LoyaltyCapRupees);
}

public sealed class DashboardService(
    IManagerDb db,
    ISosOperations sos,
    IClock clock)
{
    public async Task<DashboardDto> GetAsync(
        CancellationToken ct = default)
    {
        var now = clock.UtcNow;
        var today = now.Date;
        var weekStart = today.AddDays(-7);

        var monthStart = new DateTime(
            now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        var openSos = (await sos.ListAsync(true, ct)).Count;

        return new DashboardDto(
            await db.Appointments.CountAsync(
                a => a.SlotStart >= today
                    && a.SlotStart < today.AddDays(1)
                    && a.Status != AppointmentStatus.Cancelled
                    && a.Status != AppointmentStatus.Declined, ct),

            await db.Appointments.CountAsync(
                a => a.Status == AppointmentStatus.Requested, ct),

            await db.JobCards.CountAsync(
                j => j.Status != JobStatus.Completed
                    && j.Status != JobStatus.Closed, ct),

            await db.Proposals.CountAsync(
                p => p.Status == ProposalStatus.PendingManagerReview, ct),

            await db.Proposals.CountAsync(
                p => p.Status == ProposalStatus.CustomerResponded, ct),

            await db.ChangeRequests.CountAsync(
                c => c.Status == ChangeRequestStatus.PendingManagerReview, ct),

            openSos,

            await db.Parts.CountAsync(
                p => p.Quantity <= p.ReorderLevel, ct),

            await db.Invoices.CountAsync(
                i => i.Status == InvoiceStatus.Unpaid, ct),

            await db.Invoices
                .Where(i => i.Status == InvoiceStatus.Paid
                    && i.PaidAt >= weekStart)
                .SumAsync(i => (decimal?)i.Total, ct) ?? 0,

            await db.Invoices
                .Where(i => i.Status == InvoiceStatus.Paid
                    && i.PaidAt >= weekStart.AddDays(-7)
                    && i.PaidAt < weekStart)
                .SumAsync(i => (decimal?)i.Total, ct) ?? 0,

            await db.Earnings
                .Where(e => e.At >= monthStart)
                .SumAsync(e => (decimal?)e.Amount, ct) ?? 0);
    }
}

public sealed record MechanicRosterDto(
    Guid Id,
    string Name,
    string Phone,
    string EmployeeCode,
    bool OnDuty,
    int ActiveJobs);

public sealed class MechanicRosterService(
    IManagerDb db,
    IMechanicDirectory mechanics)
{
    public async Task<IReadOnlyList<MechanicRosterDto>> ListAsync(
        CancellationToken ct = default)
    {
        var list = await mechanics.ListAsync(ct);

        var counts = await db.JobCards
            .AsNoTracking()
            .Where(j => j.MechanicId != null
                && j.Status != JobStatus.Completed
                && j.Status != JobStatus.Closed)
            .GroupBy(j => j.MechanicId!.Value)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return list
            .Where(m => m.Active)
            .Select(m => new MechanicRosterDto(
                m.Id,
                m.Name,
                m.Phone,
                m.EmployeeCode,
                m.OnDuty,
                counts.GetValueOrDefault(m.Id)))
            .ToList();
    }
}