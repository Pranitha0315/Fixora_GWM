using Fixora.Manager.Domain;
using Fixora.SharedKernel;

namespace Fixora.Tests.Domain;

/// <summary>RepairApprovals: Mechanic → Manager → Customer → Manager → Mechanic (BRD §8, tracker FX13-D07-PRA-*).</summary>
public class ApprovalWorkflowTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 9, 0, 0, DateTimeKind.Utc);

    private static RepairProposal Proposal() => RepairProposal.Submit(Guid.NewGuid(), Guid.NewGuid(), "Pads worn", new[]
    {
        new RepairItem { Title = "Front brake pads", Kind = RepairItemKind.Part, Qty = 1, UnitPrice = 4200 },
        new RepairItem { Title = "Brake labour", Kind = RepairItemKind.Labour, Qty = 1, UnitPrice = 1500 },
        new RepairItem { Title = "Wiper blades", Kind = RepairItemKind.Part, Qty = 1, UnitPrice = 1800 },
    }, Now);

    [Fact]
    public void New_proposal_waits_for_the_manager_not_the_customer()
    {
        var p = Proposal();
        Assert.Equal(ProposalStatus.PendingManagerReview, p.Status);
        Assert.All(p.Items, i => Assert.Equal(RepairItemStatus.Proposed, i.Status));
        Assert.Throws<ConflictException>(() => p.Decide(p.Items[0].Id, true, 1, Now));
    }

    [Fact]
    public void Customer_approves_two_of_three_then_manager_releases_only_those()
    {
        var p = Proposal();
        p.ForwardToCustomer(Guid.NewGuid(), null, Now);
        Assert.False(p.Decide(p.Items[0].Id, true, 1, Now));
        Assert.False(p.Decide(p.Items[1].Id, true, 1, Now));
        Assert.True(p.Decide(p.Items[2].Id, false, 1, Now));
        Assert.Equal(ProposalStatus.CustomerResponded, p.Status);

        var released = p.Release(Guid.NewGuid(), null, Now);
        Assert.Equal(2, released.Count);
        Assert.Equal(ProposalStatus.ReleasedToMechanic, p.Status);
        Assert.Equal(5700m, p.ApprovedTotal);
    }

    [Fact]
    public void Mechanic_cannot_get_work_before_every_item_is_answered()
    {
        var p = Proposal();
        p.ForwardToCustomer(Guid.NewGuid(), null, Now);
        p.Decide(p.Items[0].Id, true, 1, Now);
        Assert.Throws<ConflictException>(() => p.Release(Guid.NewGuid(), null, Now));
    }

    [Fact]
    public void Stale_version_returns_conflict()
    {
        var p = Proposal();
        p.ForwardToCustomer(Guid.NewGuid(), null, Now);
        var ex = Assert.Throws<ConflictException>(() => p.Decide(p.Items[0].Id, true, 2, Now));
        Assert.Equal("item_version_changed", ex.Code);
    }

    [Fact]
    public void Price_increase_above_tolerance_needs_renewed_approval()
    {
        var p = Proposal();
        p.ForwardToCustomer(Guid.NewGuid(), null, Now);
        foreach (var i in p.Items) p.Decide(i.Id, true, 1, Now);
        var pads = p.Items[0];

        Assert.True(p.ReviseItem(pads.Id, 5200, 1, 0.10m, Now));
        Assert.Equal(RepairItemStatus.AwaitingCustomer, pads.Status);
        Assert.Equal(2, pads.Version);
        Assert.Equal(ProposalStatus.AwaitingCustomer, p.Status);
    }

    [Fact]
    public void Small_price_change_within_tolerance_keeps_approval()
    {
        var p = Proposal();
        p.ForwardToCustomer(Guid.NewGuid(), null, Now);
        foreach (var i in p.Items) p.Decide(i.Id, true, 1, Now);
        Assert.False(p.ReviseItem(p.Items[0].Id, 4300, 1, 0.10m, Now));
        Assert.Equal(ProposalStatus.CustomerResponded, p.Status);
    }

    [Fact]
    public void Manager_can_return_with_a_reason_only()
    {
        var p = Proposal();
        Assert.Throws<ValidationException>(() => p.ReturnToMechanic(Guid.NewGuid(), " ", Now));
        p.ReturnToMechanic(Guid.NewGuid(), "Add a photo of the pads", Now);
        Assert.Equal(ProposalStatus.ReturnedToMechanic, p.Status);
    }

    [Fact]
    public void Change_request_reaches_mechanic_only_after_manager_forwards()
    {
        var cr = new CustomerChangeRequest { ChangesPipe = "Keep old parts", CreatedAt = Now };
        Assert.Throws<ConflictException>(() => cr.Acknowledge(null, Now));
        cr.Forward("OK", Now);
        cr.Acknowledge("Will keep them in the boot", Now);
        Assert.Equal(ChangeRequestStatus.Acknowledged, cr.Status);
    }
}
