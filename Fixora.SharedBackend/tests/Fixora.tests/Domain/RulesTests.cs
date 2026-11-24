using Fixora.Customer.Domain;
using Fixora.Manager.Application.Advisor;
using Fixora.Manager.Domain;
using Fixora.SharedKernel;

namespace Fixora.Tests.Domain;

public class DriveSenseRulesTests
{
    [Fact]
    public void Demo_trip_scores_72()
        => Assert.Equal(72, DriveSenseRules.TripScore(8.0, harshBrakes: 3, harshAccels: 0, sharpCorners: 3, potholes: 14));

    [Fact]
    public void Harsh_braking_suggests_brake_pads_at_one_and_a_half_times_wear()
    {
        var profile = new VehicleWearProfile { HarshBrakesPer100Km = 37.5, RoughRoadPct = 30 };
        var rules = DriveSenseRules.Evaluate(profile, VehicleType.Car, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var brake = Assert.Single(rules);
        Assert.Equal("Brake pads", brake.Component);
        Assert.Equal(1.5, brake.Factor);
    }

    [Fact]
    public void Three_wheeler_wears_faster_than_car()
        => Assert.True(DriveSenseRules.VehicleMultiplier(VehicleType.ThreeWheeler) > DriveSenseRules.VehicleMultiplier(VehicleType.Car));
}

public class QueueEtaTests
{
    private static readonly DateTime Now = new(2026, 11, 14, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Walk_in_with_priority_moves_booked_customer_back()
    {
        var running = new QueueEtaCalculator.QueueJob(Guid.NewGuid(), JobStatus.InProgress, 0, 1, Now.AddHours(-1), 60, 30);
        var booked = new QueueEtaCalculator.QueueJob(Guid.NewGuid(), JobStatus.Open, 0, 2, Now.AddMinutes(-10), 60, 0);
        var before = QueueEtaCalculator.Compute(new[] { running, booked }, 1, Now).Single(e => e.JobId == booked.JobId);

        var walkIn = new QueueEtaCalculator.QueueJob(Guid.NewGuid(), JobStatus.Open, 1, 3, Now, 45, 0);
        var after = QueueEtaCalculator.Compute(new[] { running, booked, walkIn }, 1, Now).Single(e => e.JobId == booked.JobId);

        Assert.Equal(1, before.Position);
        Assert.Equal(2, after.Position);
        Assert.Equal(45, (after.EtaAt - before.EtaAt).TotalMinutes);
    }

    [Fact]
    public void Two_bays_run_two_jobs_in_parallel()
    {
        var a = new QueueEtaCalculator.QueueJob(Guid.NewGuid(), JobStatus.Open, 0, 1, Now, 60, 0);
        var b = new QueueEtaCalculator.QueueJob(Guid.NewGuid(), JobStatus.Open, 0, 2, Now, 60, 0);
        var etas = QueueEtaCalculator.Compute(new[] { a, b }, 2, Now);
        Assert.All(etas, e => Assert.Equal(Now.AddMinutes(60), e.EtaAt));
    }
}

public class AdvisorDetectorTests
{
    private static WeeklyMetrics Metrics(double idlePct, int comebacks = 0, double daysLeft = 10) => new(
        DateOnly.FromDateTime(DateTime.UtcNow), 50_000, 52_000,
        new[] { new SlotUtilisation("Thursday", "2–5 PM", idlePct, 24 * idlePct, 4) },
        new[] { new MechanicComebacks(Guid.NewGuid(), "Kumar", comebacks, 40, Enumerable.Repeat("Wheel Alignment", comebacks).ToList()),
                new MechanicComebacks(Guid.NewGuid(), "Ravi", 0, 40, new List<string>()) },
        comebacks / 120.0,
        new[] { new StockRisk(Guid.NewGuid(), "Aqua front brake pads", 2, daysLeft, 4, 3200) },
        0, 0, 0, 0, 100, 5, 6000);

    [Fact]
    public void IdleSlot_fires_only_above_half_idle()
    {
        Assert.Null(AdvisorDetectors.IdleSlot(Metrics(0.45)));
        var insight = AdvisorDetectors.IdleSlot(Metrics(0.67));
        Assert.NotNull(insight);
        Assert.Equal(InsightSeverity.High, insight!.Severity);
        Assert.Equal("CreatePromo", insight.ActionType);
    }

    [Fact]
    public void Planted_scenario_produces_three_insights()
    {
        var all = AdvisorDetectors.RunAll(Metrics(0.67, comebacks: 3, daysLeft: 2), _ => 1m);
        Assert.Equal(new[] { "ComebackSpike", "IdleSlot", "StockOut" }, all.Select(i => i.Detector).OrderBy(x => x));
    }

    [Fact]
    public void Thumbs_down_multiplier_silences_a_borderline_detector()
        => Assert.Null(AdvisorDetectors.IdleSlot(Metrics(0.55), mult: 1.25));
}

public class SosTests
{
    [Fact]
    public void Customer_cannot_cancel_after_dispatch()
    {
        var sos = new SosRequest { CustomerId = Guid.NewGuid() };
        sos.MoveTo(SosStatus.Dispatched, Roles.Manager, Guid.NewGuid(), null, DateTime.UtcNow);
        Assert.Throws<ConflictException>(() => sos.CancelByCustomer(sos.CustomerId, DateTime.UtcNow));
    }

    [Fact]
    public void Resolved_is_final()
    {
        var sos = new SosRequest();
        sos.MoveTo(SosStatus.Dispatched, Roles.Manager, Guid.NewGuid(), null, DateTime.UtcNow);
        sos.MoveTo(SosStatus.Resolved, Roles.Mechanic, Guid.NewGuid(), null, DateTime.UtcNow);
        Assert.Throws<ConflictException>(() => sos.MoveTo(SosStatus.OnSite, Roles.Mechanic, Guid.NewGuid(), null, DateTime.UtcNow));
    }
}
