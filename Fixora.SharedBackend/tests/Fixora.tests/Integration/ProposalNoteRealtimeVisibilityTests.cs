using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Forwarding publishes the manager note to staff and the assigned mechanic.
/// The customer copy of approval.updated and changeRequest.updated has that note removed.
/// The decline notification text is a separate customer-facing message and is not asserted here.
/// </summary>
[Collection("api")]
public sealed class ProposalNoteRealtimeVisibilityTests : IDisposable
{
    private const string ProposalSentinel = "PROPOSAL-RT-NOTE-SENTINEL-4c22";
    private const string ChangeSentinel = "CHANGE-RT-NOTE-SENTINEL-4c22";

    private readonly ManagerNoteRealtimeMaskTests.CapturingFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private async Task<HttpClient> ManagerAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var tokens = await scope.ServiceProvider.GetRequiredService<ITokenService>()
            .IssueAsync(DemoIds.Manager, Roles.Manager, "Manager");
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }

    [Fact]
    public async Task Forwarded_proposal_realtime_still_includes_the_manager_note_for_the_customer()
    {
        Guid proposalId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
            var proposal = RepairProposal.Submit(
                DemoIds.JobKavithaToday,
                DemoIds.MechanicRavi,
                "pads are thin",
                [new RepairItem { Title = "Pads", Kind = RepairItemKind.Part, Qty = 1, UnitPrice = 1000 }],
                DateTime.UtcNow);
            db.Proposals.Add(proposal);
            await db.SaveChangesAsync();
            proposalId = proposal.Id;
        }

        var res = await (await ManagerAsync()).PostAsJsonAsync(
            $"/api/v1/manager/approvals/proposals/{proposalId}/forward",
            new { note = ProposalSentinel });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var events = _factory.Notifier.Events.Where(e => e.Event == RealtimeEvents.ApprovalUpdated).ToList();
        Assert.NotEmpty(events);

        var toCustomer = Assert.Single(events, e => e.Groups.Contains(RealtimeGroups.User(DemoIds.CustomerKavitha)));
        var customerPayload = Assert.IsType<ProposalDto>(toCustomer.Payload);
        Assert.Null(customerPayload.ManagerNote);
        Assert.DoesNotContain(ProposalSentinel, System.Text.Json.JsonSerializer.Serialize(customerPayload));

        var toStaff = Assert.Single(events, e => e.Groups.Contains(RealtimeGroups.Staff));
        Assert.Equal(ProposalSentinel, Assert.IsType<ProposalDto>(toStaff.Payload).ManagerNote);

        var toMechanic = Assert.Single(events, e => e.Groups.Contains(RealtimeGroups.User(DemoIds.MechanicRavi)));
        Assert.Equal(ProposalSentinel, Assert.IsType<ProposalDto>(toMechanic.Payload).ManagerNote);
    }

    [Fact]
    public async Task Forwarded_change_request_realtime_includes_the_customer_on_the_same_note_payload()
    {
        Guid changeId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
            var change = new CustomerChangeRequest
            {
                JobCardId = DemoIds.JobKavithaToday,
                CustomerId = DemoIds.CustomerKavitha,
                Number = "CR-RT-4C22",
                ChangesPipe = "Keep old parts",
                Details = "characterization",
                Status = ChangeRequestStatus.PendingManagerReview,
                CreatedAt = DateTime.UtcNow,
            };
            db.ChangeRequests.Add(change);
            await db.SaveChangesAsync();
            changeId = change.Id;
        }

        var res = await (await ManagerAsync()).PostAsJsonAsync(
            $"/api/v1/manager/approvals/change-requests/{changeId}/forward",
            new { note = ChangeSentinel });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var published = _factory.Notifier.Events.Where(e => e.Event == RealtimeEvents.ChangeRequestUpdated).ToList();
        var toStaff = Assert.Single(published, e => e.Groups.Contains(RealtimeGroups.Staff));
        Assert.Contains(RealtimeGroups.User(DemoIds.MechanicRavi), toStaff.Groups);
        Assert.DoesNotContain(RealtimeGroups.User(DemoIds.CustomerKavitha), toStaff.Groups);
        Assert.Equal(ChangeSentinel, Assert.IsType<ChangeRequestDto>(toStaff.Payload).ManagerNote);

        var toCustomer = Assert.Single(published, e => e.Groups.Contains(RealtimeGroups.User(DemoIds.CustomerKavitha)));
        Assert.Null(Assert.IsType<ChangeRequestDto>(toCustomer.Payload).ManagerNote);
    }
}
