using System.Security.Cryptography;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Staff;

public sealed record StaffLoginRequest(string Email, string Password);
public sealed record CreateInvitationRequest(string Name, string Phone);
public sealed record InvitationDto(Guid Id, string Name, string Phone, string Token, string Link, DateTime ExpiresAt, string Status);

public sealed class StaffAuthService(IManagerDb db, IPasswordService passwords, ITokenService tokens)
{
    public async Task<AuthTokens> LoginAsync(StaffLoginRequest req, CancellationToken ct = default)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        var staff = await db.Staff.FirstOrDefaultAsync(s => s.Email == email, ct);
        if (staff is null || !passwords.Verify(staff.PasswordHash, req.Password ?? "")) throw new UnauthorizedAppException();
        return await tokens.IssueAsync(staff.Id, staff.Role, staff.Name, ct);
    }
}

/// <summary>Manager-issued 7-day mechanic invitations.</summary>
public sealed class InvitationService(IManagerDb db, IClock clock) : IInvitationGateway
{
    public const int ValidDays = 7;

    public async Task<InvitationDto> CreateAsync(Guid staffId, CreateInvitationRequest req, CancellationToken ct = default)
    {
        Guard.Against(string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Phone), "Name and phone are required.");
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(5)); // 10 hex chars, easy to read out
        var inv = new MechanicInvitation { Name = req.Name.Trim(), Phone = req.Phone.Trim(), Token = token, CreatedBy = staffId, CreatedAt = clock.UtcNow, ExpiresAt = clock.UtcNow.AddDays(ValidDays) };
        db.Invitations.Add(inv);
        await db.SaveChangesAsync(ct);
        return ToDto(inv);
    }

    public async Task<IReadOnlyList<InvitationDto>> ListAsync(CancellationToken ct = default)
        => (await db.Invitations.AsNoTracking().OrderByDescending(i => i.CreatedAt).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task RevokeAsync(Guid id, CancellationToken ct = default)
    {
        var inv = await db.Invitations.FirstOrDefaultAsync(i => i.Id == id, ct) ?? throw new NotFoundException("Invitation");
        inv.RevokedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<InvitationInfo?> FindValidAsync(string token, CancellationToken ct = default)
    {
        var t = (token ?? "").Trim().ToUpperInvariant();
        var inv = await db.Invitations.AsNoTracking().FirstOrDefaultAsync(i => i.Token == t, ct);
        return inv is not null && inv.IsValid(clock.UtcNow) ? new InvitationInfo(inv.Id, inv.Name, inv.Phone, inv.ExpiresAt) : null;
    }

    public async Task MarkAcceptedAsync(Guid invitationId, Guid mechanicId, CancellationToken ct = default)
    {
        var inv = await db.Invitations.FirstAsync(i => i.Id == invitationId, ct);
        inv.AcceptedAt = clock.UtcNow;
        inv.MechanicId = mechanicId;
        await db.SaveChangesAsync(ct);
    }

    private InvitationDto ToDto(MechanicInvitation i) => new(i.Id, i.Name, i.Phone, i.Token, $"fixorarev://join?token={i.Token}", i.ExpiresAt,
        i.AcceptedAt is not null ? "Accepted" : i.RevokedAt is not null ? "Revoked" : i.ExpiresAt <= clock.UtcNow ? "Expired" : "Pending");
}
