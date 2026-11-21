using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("fixproof-proposal-pricing-http", DisableParallelization = true)]
public sealed class FixProofProposalPricingHttpCollection;

/// <summary>
/// FX13-D07-NID-1 (tests-only): characterize proposed repair item creation and manager
/// workshop pricing over HTTP. Does not cover THA post-approval revise/idempotency production changes.
/// </summary>
[Collection("fixproof-proposal-pricing-http")]
public sealed class FixProofProposalPricingHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static string ProposeUrl(Guid jobId) => $"/api/v1/mechanic/jobs/{jobId}/proposals";

    private static string PriceUrl(Guid proposalId, Guid itemId)
        => $"/api/v1/manager/approvals/proposals/{proposalId}/items/{itemId}/price";

    private static SubmitProposalRequest ValidProposal(decimal partPrice = 4200m, decimal labourPrice = 1500m)
        => new(
            new[]
            {
                new ProposalItemInput("Front brake pads", "Part", 1, partPrice, null, DemoIds.PartBrakePads),
                new ProposalItemInput("Brake labour", "Labour", 1, labourPrice, null, null),
            },
            "NID7 pricing characterization");

    [Fact]
    public async Task Assigned_mechanic_submit_creates_priced_items_pending_manager()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(ProposeUrl(DemoIds.JobKavithaToday), ValidProposal());
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var proposal = (await response.Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("PendingManagerReview", proposal.Status);
        Assert.Equal(2, proposal.Items.Count);
        Assert.Equal(5700m, proposal.Total);

        var pads = Assert.Single(proposal.Items, i => i.Title == "Front brake pads");
        Assert.Equal("Part", pads.Kind);
        Assert.Equal(1, pads.Qty);
        Assert.Equal(4200m, pads.UnitPrice);
        Assert.Equal(4200m, pads.Amount);
        Assert.Equal("Proposed", pads.Status);

        var labour = Assert.Single(proposal.Items, i => i.Title == "Brake labour");
        Assert.Equal("Labour", labour.Kind);
        Assert.Equal(1500m, labour.UnitPrice);
        Assert.Equal(1500m, labour.Amount);
    }

    [Fact]
    public async Task Manager_can_set_item_price_before_forward()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();

        var created = (await (await ravi.PostAsJsonAsync(ProposeUrl(DemoIds.JobKavithaToday), ValidProposal()))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ProposalDto>())!;
        var pads = Assert.Single(created.Items, i => i.Title == "Front brake pads");

        var priced = await manager.PutAsJsonAsync(
            PriceUrl(created.Id, pads.Id),
            new { unitPrice = 5000m, qty = 2 });
        Assert.Equal(HttpStatusCode.OK, priced.StatusCode);

        var proposal = (await priced.Content.ReadFromJsonAsync<ProposalDto>())!;
        Assert.Equal("PendingManagerReview", proposal.Status);
        var updated = Assert.Single(proposal.Items, i => i.Id == pads.Id);
        Assert.Equal(2, updated.Qty);
        Assert.Equal(5000m, updated.UnitPrice);
        Assert.Equal(10000m, updated.Amount);
        Assert.Equal(11500m, proposal.Total);
    }

    [Fact]
    public async Task Manager_set_price_after_forward_is_rejected()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var manager = await factory.Manager();

        var created = (await (await ravi.PostAsJsonAsync(ProposeUrl(DemoIds.JobKavithaToday), ValidProposal()))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ProposalDto>())!;
        var pads = Assert.Single(created.Items, i => i.Title == "Front brake pads");

        (await manager.PostAsJsonAsync(
            $"/api/v1/manager/approvals/proposals/{created.Id}/forward",
            new { note = "Ready for customer" })).EnsureSuccessStatusCode();

        var response = await manager.PutAsJsonAsync(
            PriceUrl(created.Id, pads.Id),
            new { unitPrice = 5500m, qty = 1 });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Submit_with_empty_items_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(
            ProposeUrl(DemoIds.JobKavithaToday),
            new SubmitProposalRequest(Array.Empty<ProposalItemInput>(), "empty"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorBody>();
        Assert.Equal("validation_failed", error!.Code);
    }

    [Fact]
    public async Task Submit_with_non_positive_qty_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(
            ProposeUrl(DemoIds.JobKavithaToday),
            new SubmitProposalRequest(
                new[] { new ProposalItemInput("Bad qty", "Part", 0, 1000m, null, null) },
                null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorBody>();
        Assert.Equal("validation_failed", error!.Code);
    }

    [Fact]
    public async Task Submit_with_negative_unit_price_returns_validation_failed()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();

        var response = await ravi.PostAsJsonAsync(
            ProposeUrl(DemoIds.JobKavithaToday),
            new SubmitProposalRequest(
                new[] { new ProposalItemInput("Bad price", "Part", 1, -10m, null, null) },
                null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiErrorBody>();
        Assert.Equal("validation_failed", error!.Code);
    }

    [Fact]
    public async Task Anonymous_submit_proposal_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            ProposeUrl(DemoIds.JobKavithaToday),
            ValidProposal());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_submit_proposal_or_set_price()
    {
        await using var factory = NewFactory();
        var ravi = await factory.Mechanic();
        var customer = await factory.Customer();

        var submit = await customer.PostAsJsonAsync(
            ProposeUrl(DemoIds.JobKavithaToday),
            ValidProposal());
        Assert.Equal(HttpStatusCode.Forbidden, submit.StatusCode);

        var created = (await (await ravi.PostAsJsonAsync(ProposeUrl(DemoIds.JobKavithaToday), ValidProposal()))
            .EnsureSuccessStatusCode()
            .Content.ReadFromJsonAsync<ProposalDto>())!;
        var itemId = created.Items[0].Id;

        var price = await customer.PutAsJsonAsync(
            PriceUrl(created.Id, itemId),
            new { unitPrice = 1m, qty = 1 });
        Assert.Equal(HttpStatusCode.Forbidden, price.StatusCode);
    }

    private sealed record ApiErrorBody(string Code);
}
