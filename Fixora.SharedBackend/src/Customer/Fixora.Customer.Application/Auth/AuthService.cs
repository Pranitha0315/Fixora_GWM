using System.Security.Cryptography;
using Fixora.Customer.Application.Common;
using Fixora.Customer.Domain;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fixora.Customer.Application.Auth;

public sealed record RegisterRequest(string Name, string Email, string Phone, string Password);
public sealed record OtpSentResponse(string Email, DateTime ExpiresAt, string? DevCode);
public sealed record VerifyOtpRequest(string Email, string Code);
public sealed record LoginRequest(string Email, string Password);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Code, string NewPassword);

/// <summary>Email OTP registration, password login, JWT + rotating refresh tokens (BR-SF-01).</summary>
public sealed class AuthService(ICustomerDb db, IPasswordService passwords, ITokenService tokens, IEmailSender email, IOptions<CustomerOptions> options, IClock clock)
{
    private readonly CustomerOptions _o = options.Value;

    public async Task<OtpSentResponse> RegisterAsync(RegisterRequest req, CancellationToken ct = default)
    {
        var mail = Normalize(req.Email);
        Guard.Against(string.IsNullOrWhiteSpace(req.Name), "Name is required.");
        Guard.Against(!mail.Contains('@'), "Enter a valid email.");
        Guard.Against((req.Password ?? "").Length < 8, "Password must be at least 8 characters.");

        var existing = await db.Customers.FirstOrDefaultAsync(c => c.Email == mail, ct);
        if (existing is { EmailVerified: true }) throw new ConflictException("email_taken", "An account with this email already exists. Log in instead.");
        if (existing is null)
        {
            existing = new CustomerAccount { Email = mail, CreatedAt = clock.UtcNow };
            db.Customers.Add(existing);
        }
        existing.Name = req.Name.Trim();
        existing.Phone = req.Phone?.Trim() ?? "";
        existing.PasswordHash = passwords.Hash(req.Password!);
        await db.SaveChangesAsync(ct);
        return await SendOtpAsync(mail, "register", ct);
    }

    public async Task<AuthTokens> VerifyOtpAsync(VerifyOtpRequest req, CancellationToken ct = default)
    {
        var mail = Normalize(req.Email);
        await ConsumeOtpAsync(mail, "register", req.Code, ct);
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == mail, ct) ?? throw new NotFoundException("Account");
        customer.EmailVerified = true;
        await db.SaveChangesAsync(ct);
        return await tokens.IssueAsync(customer.Id, Roles.Customer, customer.Name, ct);
    }

    public async Task<OtpSentResponse> ResendOtpAsync(string emailAddress, CancellationToken ct = default)
    {
        var mail = Normalize(emailAddress);
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Email == mail, ct) ?? throw new NotFoundException("Account");
        if (customer.EmailVerified) throw new ConflictException("already_verified", "This email is already verified.");
        return await SendOtpAsync(mail, "register", ct);
    }

    public async Task<AuthTokens> LoginAsync(LoginRequest req, CancellationToken ct = default)
    {
        var mail = Normalize(req.Email);
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Email == mail, ct);
        if (customer is null || !passwords.Verify(customer.PasswordHash, req.Password ?? "")) throw new UnauthorizedAppException("Wrong email or password.");
        if (!customer.EmailVerified) throw new AppException(403, "email_not_verified", "Verify your email first. We sent you a code.");
        return await tokens.IssueAsync(customer.Id, Roles.Customer, customer.Name, ct);
    }

    public async Task<OtpSentResponse> ForgotPasswordAsync(ForgotPasswordRequest req, CancellationToken ct = default)
    {
        var mail = Normalize(req.Email);
        var exists = await db.Customers.AnyAsync(c => c.Email == mail, ct);
        // Same answer either way so the endpoint cannot be used to discover accounts.
        return exists ? await SendOtpAsync(mail, "reset", ct) : new OtpSentResponse(mail, clock.UtcNow.AddMinutes(_o.OtpMinutes), null);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest req, CancellationToken ct = default)
    {
        var mail = Normalize(req.Email);
        Guard.Against((req.NewPassword ?? "").Length < 8, "Password must be at least 8 characters.");
        await ConsumeOtpAsync(mail, "reset", req.Code, ct);
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Email == mail, ct) ?? throw new NotFoundException("Account");
        customer.PasswordHash = passwords.Hash(req.NewPassword!);
        customer.EmailVerified = true;
        await db.SaveChangesAsync(ct);
    }

    private async Task<OtpSentResponse> SendOtpAsync(string mail, string purpose, CancellationToken ct)
    {
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("000000");
        var expires = clock.UtcNow.AddMinutes(_o.OtpMinutes);
        var old = await db.OtpChallenges.Where(o => o.Email == mail && o.Purpose == purpose && o.ConsumedAt == null).ToListAsync(ct);
        old.ForEach(o => o.ConsumedAt = clock.UtcNow);
        db.OtpChallenges.Add(new EmailOtpChallenge { Email = mail, Purpose = purpose, CodeHash = passwords.Hash(code), ExpiresAt = expires });
        await db.SaveChangesAsync(ct);
        await email.SendAsync(mail, "Your Fixora code", $"Your Fixora verification code is {code}. It expires in {_o.OtpMinutes} minutes.", ct);
        return new OtpSentResponse(mail, expires, _o.ExposeDevOtp ? code : null);
    }

    private async Task ConsumeOtpAsync(string mail, string purpose, string code, CancellationToken ct)
    {
        var otp = await db.OtpChallenges.Where(o => o.Email == mail && o.Purpose == purpose && o.ConsumedAt == null)
            .OrderByDescending(o => o.ExpiresAt).FirstOrDefaultAsync(ct);
        if (otp is null || !otp.IsUsable(clock.UtcNow)) throw new AppException(400, "otp_expired", "The code has expired. Ask for a new one.");
        otp.Attempts++;
        if (!passwords.Verify(otp.CodeHash, (code ?? "").Trim()))
        {
            await db.SaveChangesAsync(ct);
            throw new AppException(400, "otp_invalid", $"Wrong code. {EmailOtpChallenge.MaxAttempts - otp.Attempts} attempt(s) left.");
        }
        otp.ConsumedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    private static string Normalize(string? email) => (email ?? "").Trim().ToLowerInvariant();
}
