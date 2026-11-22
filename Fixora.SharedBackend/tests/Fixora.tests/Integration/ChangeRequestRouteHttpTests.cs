using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("change-request-route-http", DisableParallelization = true)]
public sealed class ChangeRequestRouteHttpCollection;

/// <summary>
/// FX13-RT-02 (tests-only): characterize customer → manager (forward/decline) → mechanic
/// acknowledge HTTP route. Does not change ChangeRequestService production or THA paths.
/// </summary>
[Collection("change-request-route-http")]
public sealed class ChangeRequestRouteHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static string CreateUrl(Guid jobId) => $"/api/v1/customer/jobs/{jobId}/change-requests";

    private static string ForwardUrl(Guid id) => $"/api/v1/manager/approvals/change-requests/{id}/forward";

    private static string DeclineUrl(Guid id) => $"/api/v1/manager/approvals/change-requests/{id}/decline";

    private static string AcknowledgeUrl(Guid id) => $"/api/v1/mechanic/jobs/change-requests/{id}/acknowledge";

    private static ChangeRequestCreate ValidCreate(string marker)
        => new(new[] { "Keep old parts", marker }, "NID RT-02 characterization");

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static async Task<HttpClient> KumarAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

    [Fact]
    public async Task Customer_create_then_manager_forward_then_mechanic_acknowledge()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var marker = $"RT02-FWD-{Guid.NewGuid():N}";
        var jobId = DemoIds.JobKavithaToday;

        var create = await kavitha.PostAsJsonAsync(CreateUrl(jobId), ValidCreate(marker));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var pending = (await create.Content.ReadFromJsonAsync<ChangeRequestDto>())!;
        Assert.Equal("PendingManagerReview", pending.Status);
        Assert.Equal(jobId, pending.JobCardId);
        Assert.Contains(marker, pending.Changes);
        Assert.False(string.IsNullOrWhiteSpace(pending.Number));

        var forward = await manager.PostAsJsonAsync(ForwardUrl(pending.Id), new { note = "OK for Ravi" });
        Assert.Equal(HttpStatusCode.OK, forward.StatusCode);
        var forwarded = (await forward.Content.ReadFromJsonAsync<ChangeRequestDto>())!;
        Assert.Equal("ForwardedToMechanic", forwarded.Status);
        Assert.Equal("OK for Ravi", forwarded.ManagerNote);

        var ack = await ravi.PostAsJsonAsync(AcknowledgeUrl(pending.Id), new { note = "Will keep old pads" });
        Assert.Equal(HttpStatusCode.OK, ack.StatusCode);
        var acknowledged = (await ack.Content.ReadFromJsonAsync<ChangeRequestDto>())!;
        Assert.Equal("Acknowledged", acknowledged.Status);
        Assert.Equal("Will keep old pads", acknowledged.MechanicNote);
    }

    [Fact]
    public async Task Manager_decline_with_reason_stops_before_mechanic()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var ravi = await factory.Mechanic();
        var marker = $"RT02-DECLINE-{Guid.NewGuid():N}";

        var pending = (await (await kavitha.PostAsJsonAsync(
                CreateUrl(DemoIds.JobKavithaToday), ValidCreate(marker)))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ChangeRequestDto>())!;

        var decline = await manager.PostAsJsonAsync(DeclineUrl(pending.Id), new { note = "Not possible this visit" });
        Assert.Equal(HttpStatusCode.OK, decline.StatusCode);
        var declined = (await decline.Content.ReadFromJsonAsync<ChangeRequestDto>())!;
        Assert.Equal("Declined", declined.Status);
        Assert.Equal("Not possible this visit", declined.ManagerNote);

        var ack = await ravi.PostAsJsonAsync(AcknowledgeUrl(pending.Id), new { note = "try" });
        Assert.Equal(HttpStatusCode.Conflict, ack.StatusCode);
        var error = (await ack.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("change_not_forwarded", error.Code);
    }

    [Fact]
    public async Task Create_with_empty_changes_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.PostAsJsonAsync(
            CreateUrl(DemoIds.JobKavithaToday),
            new ChangeRequestCreate(Array.Empty<string>(), "empty"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Decline_without_reason_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();

        var pending = (await (await kavitha.PostAsJsonAsync(
                CreateUrl(DemoIds.JobKavithaToday),
                ValidCreate($"RT02-EMPTY-NOTE-{Guid.NewGuid():N}")))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ChangeRequestDto>())!;

        var response = await manager.PostAsJsonAsync(DeclineUrl(pending.Id), new { note = "" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Anonymous_create_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            CreateUrl(DemoIds.JobKavithaToday),
            ValidCreate("anon"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Other_customer_cannot_create_on_foreign_job()
    {
        await using var factory = NewFactory();
        var arun = await ArunAsync(factory);

        var response = await arun.PostAsJsonAsync(
            CreateUrl(DemoIds.JobKavithaToday),
            ValidCreate("foreign"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Unassigned_mechanic_cannot_acknowledge_forwarded_request()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var kumar = await KumarAsync(factory);

        var pending = (await (await kavitha.PostAsJsonAsync(
                CreateUrl(DemoIds.JobKavithaToday),
                ValidCreate($"RT02-KUMAR-{Guid.NewGuid():N}")))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ChangeRequestDto>())!;

        (await manager.PostAsJsonAsync(ForwardUrl(pending.Id), new { note = "forwarded" }))
            .EnsureSuccessStatusCode();

        var response = await kumar.PostAsJsonAsync(AcknowledgeUrl(pending.Id), new { note = "nope" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("not_found", error.Code);
    }
}
