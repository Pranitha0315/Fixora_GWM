using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Inventory;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("approval-decide-release-http", DisableParallelization = true)]
public sealed class ApprovalDecideReleaseHttpCollection;

/// <summary>
/// FX13-D07-NID-2 Slice 1 (tests-only): customer partial decide → manager release →
/// mechanic allowed (Released) items, stock consume, stale version conflict, authz.
/// Does not edit ApprovalWorkflowService / Approvals domain (THA-sensitive paths).
/// </summary>
[Collection("approval-decide-release-http")]
public sealed class ApprovalDecideReleaseHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static async Task<ProposalDto> SubmitForwardedProposalAsync(
        HttpClient ravi,
        HttpClient manager,
        Guid jobId)
    {
        var submit = await ravi.PostAsJsonAsync(
            $"/api/v1/mechanic/jobs/{jobId}/proposals",
            new SubmitProposalRequest(
                new[]
                {
                    new ProposalItemInput("Front brake pads", "Part", 1, 4200m, null, DemoIds.PartBrakePads),
                    new ProposalItemInput("Brake labour", "Labour", 1, 1500m, null, null),
                    new ProposalItemInput("Wiper blades", "Part", 1, 1800m, null, null),
                },
                "D07-NID-2 characterization"));
        submit.EnsureSuccessStatusCode();
        var proposal = (await submit.Content.ReadFromJsonAsync<ProposalDto>())!;

        (await manager.PostAsJsonAsync(
                $"/api/v1/manager/approvals/proposals/{proposal.Id}/forward",
                new { note = "Forwarded for decide tests" }))
            .EnsureSuccessStatusCode();

        return proposal;
    }

    private static async Task<ProposalDto> CustomerPendingAsync(HttpClient kavitha, Guid proposalId)
    {
        var pending = (await kavitha.GetFromJsonAsync<List<ProposalDto>>("/api/v1/customer/approvals/pending"))!;
        return Assert.Single(pending, p => p.Id == proposalId);
    }

    private static async Task<ProposalDto> DecideAsync(
        HttpClient customer,
        Guid proposalId,
        DecideItemsRequest body,
        string idempotencyKey)
    {
        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/customer/approvals/{proposalId}/decisions")
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        var response = await customer.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ProposalDto>())!;
    }

    [Fact]
    public async Task Approve_two_of_three_then_release_shows_only_allowed_items_to_mechanic_and_consumes_stock()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();
        var jobId = DemoIds.JobKavithaToday;

        var stockBefore = (await manager.GetFromJsonAsync<List<PartDto>>("/api/v1/manager/inventory/parts"))!
            .Single(p => p.Id == DemoIds.PartBrakePads).Quantity;

        var submitted = await SubmitForwardedProposalAsync(ravi, manager, jobId);
        var pending = await CustomerPendingAsync(kavitha, submitted.Id);

        var decisions = new DecideItemsRequest(
            pending.Items.Select(i => new ItemDecision(i.Id, i.Title != "Wiper blades", i.Version)).ToList(),
            "Approve pads + labour only");
        var decided = await DecideAsync(kavitha, pending.Id, decisions, $"d07-decide-{Guid.NewGuid():N}");
        Assert.Equal("CustomerResponded", decided.Status);
        Assert.Equal(5700m, decided.ApprovedTotal);
        Assert.Equal(2, decided.Items.Count(i => i.Status == "Approved"));
        Assert.Equal(1, decided.Items.Count(i => i.Status == "Rejected"));

        var beforeRelease = (await ravi.GetFromJsonAsync<List<ProposalDto>>(
            $"/api/v1/mechanic/jobs/{jobId}/proposals"))!.Single(p => p.Id == pending.Id);
        Assert.Equal("AwaitingCustomer", beforeRelease.Status);

        (await manager.PostAsJsonAsync(
                $"/api/v1/manager/approvals/proposals/{pending.Id}/release",
                new { note = "Do approved work" }))
            .EnsureSuccessStatusCode();

        var released = (await ravi.GetFromJsonAsync<List<ProposalDto>>(
            $"/api/v1/mechanic/jobs/{jobId}/proposals"))!.Single(p => p.Id == pending.Id);
        Assert.Equal("ReleasedToMechanic", released.Status);
        Assert.Equal(2, released.Items.Count(i => i.Status == "Released"));
        Assert.Contains(released.Items, i => i.Title == "Front brake pads" && i.Status == "Released");
        Assert.Contains(released.Items, i => i.Title == "Brake labour" && i.Status == "Released");
        Assert.Contains(released.Items, i => i.Title == "Wiper blades" && i.Status == "Rejected");

        var stockAfter = (await manager.GetFromJsonAsync<List<PartDto>>("/api/v1/manager/inventory/parts"))!
            .Single(p => p.Id == DemoIds.PartBrakePads).Quantity;
        Assert.Equal(stockBefore - 1, stockAfter);
    }

    [Fact]
    public async Task Stale_item_version_after_manager_revise_returns_item_version_changed()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();

        var submitted = await SubmitForwardedProposalAsync(ravi, manager, DemoIds.JobKavithaToday);
        var pending = await CustomerPendingAsync(kavitha, submitted.Id);
        var pads = pending.Items.Single(i => i.Title == "Front brake pads");
        var staleVersion = pads.Version;

        (await manager.PutAsJsonAsync(
                $"/api/v1/manager/approvals/proposals/{pending.Id}/items/{pads.Id}/revise",
                new { unitPrice = 4800m, qty = 1 }))
            .EnsureSuccessStatusCode();

        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/customer/approvals/{pending.Id}/decisions")
        {
            Content = JsonContent.Create(new DecideItemsRequest(
                new[] { new ItemDecision(pads.Id, true, staleVersion) },
                null))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d07-stale-{Guid.NewGuid():N}");

        var response = await kavitha.SendAsync(request);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("item_version_changed", error.Code);
    }

    [Fact]
    public async Task Decide_without_idempotency_key_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();

        var submitted = await SubmitForwardedProposalAsync(ravi, manager, DemoIds.JobKavithaToday);
        var pending = await CustomerPendingAsync(kavitha, submitted.Id);
        var item = pending.Items[0];

        var response = await kavitha.PostAsJsonAsync(
            $"/api/v1/customer/approvals/{pending.Id}/decisions",
            new DecideItemsRequest(new[] { new ItemDecision(item.Id, true, item.Version) }, null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("validation_failed", error.Code);
    }

    [Fact]
    public async Task Other_customer_cannot_decide_foreign_proposal()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();
        var kavitha = await factory.Customer();
        var arun = await ArunAsync(factory);

        var submitted = await SubmitForwardedProposalAsync(ravi, manager, DemoIds.JobKavithaToday);
        var pending = await CustomerPendingAsync(kavitha, submitted.Id);
        var item = pending.Items[0];

        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/customer/approvals/{pending.Id}/decisions")
        {
            Content = JsonContent.Create(new DecideItemsRequest(
                new[] { new ItemDecision(item.Id, true, item.Version) },
                null))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d07-foreign-{Guid.NewGuid():N}");

        var response = await arun.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("not_found", error.Code);
    }

    [Fact]
    public async Task Anonymous_decide_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            $"/api/v1/customer/approvals/{Guid.NewGuid()}/decisions",
            new DecideItemsRequest(new[] { new ItemDecision(Guid.NewGuid(), true, 1) }, null));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
