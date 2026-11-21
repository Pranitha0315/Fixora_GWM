using Fixora.Customer.Domain;

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
