using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.Auth;
using Fixora.Shared.Contracts;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("customer-auth-otp-http", DisableParallelization = true)]
public sealed class CustomerAuthOtpHttpCollection;

/// <summary>
/// Conflict-safe tests-only: customer register/verify OTP, login gates, forgot/reset.
/// No Confirm/CheckIn timing or THA production edits.
/// </summary>
[Collection("customer-auth-otp-http")]
public sealed class CustomerAuthOtpHttpTests
{
    private static FixoraFactory NewFactory() => new();

    [Fact]
    public async Task Register_verify_otp_then_login_round_trips()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var email = $"nid.otp.{Guid.NewGuid():N}@fixora.test";

        var register = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/register",
            new RegisterRequest("NID New", email, "+94770009988", "Fixora@123"));
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);
        var sent = (await register.Content.ReadFromJsonAsync<OtpSentResponse>())!;
        Assert.Equal(email.ToLowerInvariant(), sent.Email.ToLowerInvariant());
        Assert.False(string.IsNullOrWhiteSpace(sent.DevCode));

        var blocked = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/login",
            new LoginRequest(email, "Fixora@123"));
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);

        var verify = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/verify-otp",
            new VerifyOtpRequest(email, sent.DevCode!));
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(
            (await verify.Content.ReadFromJsonAsync<AuthTokens>())!.AccessToken));

        var login = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/login",
            new LoginRequest(email, "Fixora@123"));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Register_rejects_taken_verified_email_and_short_password()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var taken = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/register",
            new RegisterRequest("Dup", "kavitha@fixora.lk", "+94770000001", "Fixora@123"));
        Assert.Equal(HttpStatusCode.Conflict, taken.StatusCode);

        var shortPw = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/register",
            new RegisterRequest("Short", $"short.{Guid.NewGuid():N}@fixora.test", "+94770000002", "abc"));
        Assert.Equal(HttpStatusCode.BadRequest, shortPw.StatusCode);
    }

    [Fact]
    public async Task Wrong_otp_is_rejected_and_resend_works()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var email = $"nid.resend.{Guid.NewGuid():N}@fixora.test";

        var sent = (await (await client.PostAsJsonAsync(
            "/api/v1/customer/auth/register",
            new RegisterRequest("Resend Me", email, "+94770000003", "Fixora@123")))
            .Content.ReadFromJsonAsync<OtpSentResponse>())!;

        var wrong = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/verify-otp",
            new VerifyOtpRequest(email, "000000"));
        Assert.True(
            wrong.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Conflict,
            $"Unexpected status {wrong.StatusCode}");

        var resend = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/resend-otp",
            new { email });
        Assert.Equal(HttpStatusCode.OK, resend.StatusCode);
        var again = (await resend.Content.ReadFromJsonAsync<OtpSentResponse>())!;
        Assert.False(string.IsNullOrWhiteSpace(again.DevCode));
        Assert.NotEqual(sent.DevCode, again.DevCode);

        var verify = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/verify-otp",
            new VerifyOtpRequest(email, again.DevCode!));
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
    }

    [Fact]
    public async Task Forgot_and_reset_password_allows_new_login()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();
        var email = "arun@fixora.lk";

        var forgot = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/forgot-password",
            new ForgotPasswordRequest(email));
        Assert.Equal(HttpStatusCode.OK, forgot.StatusCode);
        var sent = (await forgot.Content.ReadFromJsonAsync<OtpSentResponse>())!;
        Assert.False(string.IsNullOrWhiteSpace(sent.DevCode));

        var reset = await client.PostAsJsonAsync(
            "/api/v1/customer/auth/reset-password",
            new ResetPasswordRequest(email, sent.DevCode!, "Fixora@999"));
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                "/api/v1/customer/auth/login",
                new LoginRequest(email, "Fixora@123"))).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync(
                "/api/v1/customer/auth/login",
                new LoginRequest(email, "Fixora@999"))).StatusCode);
    }

    [Fact]
    public async Task Wrong_password_login_is_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(
                "/api/v1/customer/auth/login",
                new LoginRequest("kavitha@fixora.lk", "wrong-password"))).StatusCode);
    }
}
