using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fixora.Customer.Application.Sos;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Fixora.Tests.Integration;

/// <summary>Boots the ONE backend in-memory with seeded demo data (no SQL Server needed).</summary>
public sealed class FixoraFactory : WebApplicationFactory<Program>
{
    public FixoraFactory()
    {
        Environment.SetEnvironmentVariable("Database__Provider", "InMemory");
        Environment.SetEnvironmentVariable("Database__InMemoryName", $"fixora-tests-{Guid.NewGuid():N}");
        Environment.SetEnvironmentVariable("Workers__Enabled", "false");
    }

    public async Task<HttpClient> LoginAsync(string path, object body)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync(path, body);
        res.EnsureSuccessStatusCode();
        var tokens = await res.Content.ReadFromJsonAsync<AuthTokens>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens!.AccessToken);
        return client;
    }

    public Task<HttpClient> Mechanic() => LoginAsync("/api/v1/mechanic/auth/pin-login", new { login = "EMP-001", pin = "1234" });
    public Task<HttpClient> Manager() => LoginAsync("/api/v1/manager/auth/login", new { email = "manager@fixora.lk", password = "Fixora@123" });
    public Task<HttpClient> Customer() => LoginAsync("/api/v1/customer/auth/login", new { email = "kavitha@fixora.lk", password = "Fixora@123" });
}

[CollectionDefinition("api", DisableParallelization = true)]
public sealed class ApiCollection : ICollectionFixture<FixoraFactory> { }

[Collection("api")]
public class RealtimeApprovalFlowTests(FixoraFactory factory)
{
    [Fact]
    public async Task Mechanic_to_manager_to_customer_to_manager_to_mechanic()
    {
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();
        var job = DemoIds.JobKavithaToday;

        // 1. Mechanic proposes → goes to the manager only.
        var submit = await ravi.PostAsJsonAsync($"/api/v1/mechanic/jobs/{job}/proposals", new SubmitProposalRequest(new[]
        {
            new ProposalItemInput("Front brake pads", "Part", 1, 4200, null, DemoIds.PartBrakePads),
            new ProposalItemInput("Brake labour", "Labour", 1, 1500, null, null),
            new ProposalItemInput("Wiper blades", "Part", 1, 1800, null, null),
        }, "Pads at 2 mm"));
        submit.EnsureSuccessStatusCode();
        var proposal = (await submit.Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("PendingManagerReview", proposal.Status);

        // AC-02: the customer cannot see it before the manager forwards it.
        Assert.Empty((await kavitha.GetFromJsonAsync<List<ProposalDto>>("/api/v1/customer/approvals/pending"))!);

        // 2. Manager → customer.
        var fwd = await manager.PostAsJsonAsync($"/api/v1/manager/approvals/proposals/{proposal.Id}/forward", new { note = "Checked the photos" });
        fwd.EnsureSuccessStatusCode();
        var pending = (await kavitha.GetFromJsonAsync<List<ProposalDto>>("/api/v1/customer/approvals/pending"))!;
        var p = Assert.Single(pending);

        // 3. Customer approves 2 of 3 with an idempotency key; a retry with the same key changes nothing.
        var decisions = new DecideItemsRequest(p.Items.Select(i => new ItemDecision(i.Id, i.Title != "Wiper blades", i.Version)).ToList(), null);
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/customer/approvals/{p.Id}/decisions") { Content = JsonContent.Create(decisions) };
        req.Headers.Add("Idempotency-Key", "k-123");
        var decided = (await (await kavitha.SendAsync(req)).Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("CustomerResponded", decided.Status);
        Assert.Equal(5700m, decided.ApprovedTotal);

        var retry = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/customer/approvals/{p.Id}/decisions") { Content = JsonContent.Create(decisions) };
        retry.Headers.Add("Idempotency-Key", "k-123");
        Assert.Equal(HttpStatusCode.OK, (await kavitha.SendAsync(retry)).StatusCode);

        // The mechanic still sees "waiting" — the manager has not released yet.
        var mechView = (await ravi.GetFromJsonAsync<List<ProposalDto>>($"/api/v1/mechanic/jobs/{job}/proposals"))!.First();
        Assert.Equal("AwaitingCustomer", mechView.Status);

        // 4. Manager → mechanic.
        (await manager.PostAsJsonAsync($"/api/v1/manager/approvals/proposals/{p.Id}/release", new { note = "Go ahead" })).EnsureSuccessStatusCode();
        mechView = (await ravi.GetFromJsonAsync<List<ProposalDto>>($"/api/v1/mechanic/jobs/{job}/proposals"))!.First();
        Assert.Equal("ReleasedToMechanic", mechView.Status);
        Assert.Equal(2, mechView.Items.Count(i => i.Status == "Released"));

        // Every hop left a notification for the right person.
        var mechNotes = (await ravi.GetFromJsonAsync<List<NotificationDto>>("/api/v1/notifications"))!;
        var custNotes = (await kavitha.GetFromJsonAsync<List<NotificationDto>>("/api/v1/notifications"))!;
        var mgrNotes = (await manager.GetFromJsonAsync<List<NotificationDto>>("/api/v1/notifications"))!;
        Assert.Contains(mgrNotes, n => n.Type == NotificationTypes.ProposalSubmitted);
        Assert.Contains(custNotes, n => n.Type == NotificationTypes.ApprovalRequested);
        Assert.Contains(mgrNotes, n => n.Type == NotificationTypes.CustomerDecided);
        Assert.Contains(mechNotes, n => n.Type == NotificationTypes.WorkReleased);
        Assert.Contains(custNotes, n => n.Type == NotificationTypes.WorkConfirmed);
        Assert.DoesNotContain(mechNotes, n => n.Type == NotificationTypes.CustomerDecided);
    }

    [Fact]
    public async Task Duplicate_sos_with_same_key_creates_one_receipt()
    {
        var kavitha = await factory.Customer();
        async Task<SosReceipt> Send()
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/customer/sos/requests")
            {
                Content = JsonContent.Create(new CreateSosRequest(9.6615, 80.0255, "FlatTyre", DemoIds.VehicleWagonR, "A9 near Chavakachcheri", true)),
            };
            req.Headers.Add("Idempotency-Key", "sos-1");
            var res = await kavitha.SendAsync(req);
            res.EnsureSuccessStatusCode();
            return (await res.Content.ReadFromJsonAsync<SosReceipt>())!;
        }
        var first = await Send();
        var second = await Send();
        Assert.Equal(first.ReceiptId, second.ReceiptId);
        Assert.True(second.Duplicate);
    }

    [Fact]
    public async Task Customer_cannot_read_someone_elses_job()
    {
        var kavitha = await factory.Customer();
        var res = await kavitha.GetAsync($"/api/v1/customer/jobs/{DemoIds.JobArunToday}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Mechanic_token_cannot_call_manager_api()
    {
        var ravi = await factory.Mechanic();
        Assert.Equal(HttpStatusCode.Forbidden, (await ravi.GetAsync("/api/v1/manager/dashboard")).StatusCode);
    }
}
