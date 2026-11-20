using Fixora.Manager.Contracts;
using Fixora.Mechanic.Application.Common;
using Fixora.Mechanic.Contracts;
using Fixora.Mechanic.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Mechanic.Application.Auth;

public sealed record PinLoginRequest(string Login, string Pin);
public sealed record AcceptInvitationRequest(string Token, string Name, string Pin);
public sealed record ChangePinRequest(string CurrentPin, string NewPin);
public sealed record MechanicProfileDto(Guid Id, string Name, string Phone, string EmployeeCode, bool OnDuty, string PreferredLanguage);
public sealed record DutyRequest(bool OnDuty);

public sealed class MechanicAuthService(IMechanicDb db, IPasswordService passwords, ITokenService tokens, IInvitationGateway invitations, IClock clock)
{
    /// <summary>Login with employee code (EMP-001) or phone + 4-digit PIN; 5 wrong PINs lock for 15 minutes.</summary>
    public async Task<AuthTokens> LoginAsync(PinLoginRequest req, CancellationToken ct = default)
    {
        var login = (req.Login ?? "").Trim().ToUpperInvariant();
        var m = await db.Mechanics.FirstOrDefaultAsync(x => (x.EmployeeCode == login || x.Phone == req.Login) && x.Active, ct);
        if (m is null) throw new UnauthorizedAppException("Wrong code or PIN.");
        if (m.LockedUntil > clock.UtcNow) throw new AppException(423, "pin_locked", "Too many wrong PINs. Try again in 15 minutes or ask the manager.");
        if (!passwords.Verify(m.PinHash, req.Pin ?? ""))
        {
            m.RegisterFailedPin(clock.UtcNow);
            await db.SaveChangesAsync(ct);
            throw new UnauthorizedAppException("Wrong code or PIN.");
        }
        m.FailedPinAttempts = 0;
        m.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return await tokens.IssueAsync(m.Id, Roles.Mechanic, m.Name, ct);
    }

    public async Task<InvitationInfo> CheckInvitationAsync(string token, CancellationToken ct = default)
        => await invitations.FindValidAsync(token, ct) ?? throw new AppException(410, "invite_expired", "This invitation has expired or was already used. Ask the manager for a new one.");

    /// <summary>Accept a manager's 7-day invitation and set a PIN.</summary>
    public async Task<AuthTokens> AcceptInvitationAsync(AcceptInvitationRequest req, CancellationToken ct = default)
    {
        Guard.Against(req.Pin is null || req.Pin.Length != 4 || !req.Pin.All(char.IsDigit), "PIN must be 4 digits.");
        var inv = await CheckInvitationAsync(req.Token, ct);
        var count = await db.Mechanics.CountAsync(ct);
        var m = new MechanicAccount
        {
            Name = string.IsNullOrWhiteSpace(req.Name) ? inv.Name : req.Name.Trim(),
            Phone = inv.Phone,
            EmployeeCode = $"EMP-{count + 1:000}",
            PinHash = passwords.Hash(req.Pin!),
            InvitationId = inv.Id,
            CreatedAt = clock.UtcNow,
        };
        db.Mechanics.Add(m);
        await db.SaveChangesAsync(ct);
        await invitations.MarkAcceptedAsync(inv.Id, m.Id, ct);
        return await tokens.IssueAsync(m.Id, Roles.Mechanic, m.Name, ct);
    }

    public async Task<MechanicProfileDto> ProfileAsync(Guid id, CancellationToken ct = default)
    {
        var m = await db.Mechanics.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Mechanic");
        return new MechanicProfileDto(m.Id, m.Name, m.Phone, m.EmployeeCode, m.OnDuty, m.PreferredLanguage);
    }

    public async Task ChangePinAsync(Guid id, ChangePinRequest req, CancellationToken ct = default)
    {
        Guard.Against(req.NewPin is null || req.NewPin.Length != 4 || !req.NewPin.All(char.IsDigit), "PIN must be 4 digits.");
        var m = await db.Mechanics.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Mechanic");
        if (!passwords.Verify(m.PinHash, req.CurrentPin ?? "")) throw new UnauthorizedAppException("Current PIN is wrong.");
        m.PinHash = passwords.Hash(req.NewPin!);
        await db.SaveChangesAsync(ct);
    }

    public async Task<MechanicProfileDto> SetDutyAsync(Guid id, bool onDuty, CancellationToken ct = default)
    {
        var m = await db.Mechanics.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Mechanic");
        m.OnDuty = onDuty;
        await db.SaveChangesAsync(ct);
        return await ProfileAsync(id, ct);
    }
}

public sealed class MechanicDirectory(IMechanicDb db) : IMechanicDirectory
{
    public async Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default)
        => await db.Mechanics.AsNoTracking().Where(m => m.Id == mechanicId)
            .Select(m => new MechanicSummary(m.Id, m.Name, m.Phone, m.EmployeeCode, m.Active, m.OnDuty)).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default)
        => await db.Mechanics.AsNoTracking().OrderBy(m => m.EmployeeCode)
            .Select(m => new MechanicSummary(m.Id, m.Name, m.Phone, m.EmployeeCode, m.Active, m.OnDuty)).ToListAsync(ct);
}
