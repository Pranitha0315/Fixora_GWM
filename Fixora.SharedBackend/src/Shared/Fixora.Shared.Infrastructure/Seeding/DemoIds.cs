namespace Fixora.Shared.Infrastructure.Seeding;

/// <summary>
/// Fixed ids for the seeded demo garage so the three apps, tests and the viva script line up.
/// Demo logins (password / PIN):
///   Owner    owner@fixora.lk    / Fixora@123
///   Manager  manager@fixora.lk  / Fixora@123
///   Customer kavitha@fixora.lk  / Fixora@123   (also arun@fixora.lk)
///   Mechanic EMP-001 Ravi PIN 1234 · EMP-002 Kumar PIN 2345 · EMP-003 Senthil PIN 3456
/// </summary>
public static class DemoIds
{
    public static readonly Guid Workshop = Guid.Parse("10000000-0000-0000-0000-000000000001");
    public static readonly Guid Bay1 = Guid.Parse("10000000-0000-0000-0000-0000000000b1");
    public static readonly Guid Bay2 = Guid.Parse("10000000-0000-0000-0000-0000000000b2");

    public static readonly Guid Owner = Guid.Parse("20000000-0000-0000-0000-000000000001");
    public static readonly Guid Manager = Guid.Parse("20000000-0000-0000-0000-000000000002");

    public static readonly Guid MechanicRavi = Guid.Parse("30000000-0000-0000-0000-000000000001");
    public static readonly Guid MechanicKumar = Guid.Parse("30000000-0000-0000-0000-000000000002");
    public static readonly Guid MechanicSenthil = Guid.Parse("30000000-0000-0000-0000-000000000003");

    public static readonly Guid CustomerKavitha = Guid.Parse("40000000-0000-0000-0000-000000000001");
    public static readonly Guid CustomerArun = Guid.Parse("40000000-0000-0000-0000-000000000002");
    public static readonly Guid VehicleWagonR = Guid.Parse("50000000-0000-0000-0000-000000000001");
    public static readonly Guid VehicleThreeWheeler = Guid.Parse("50000000-0000-0000-0000-000000000002");
    public static readonly Guid VehicleArunAxio = Guid.Parse("50000000-0000-0000-0000-000000000003");

    public static readonly Guid ServiceGeneral = Guid.Parse("60000000-0000-0000-0000-000000000001");
    public static readonly Guid ServiceBrake = Guid.Parse("60000000-0000-0000-0000-000000000002");
    public static readonly Guid ServiceOil = Guid.Parse("60000000-0000-0000-0000-000000000003");
    public static readonly Guid ServiceAlignment = Guid.Parse("60000000-0000-0000-0000-000000000004");
    public static readonly Guid ServiceSuspension = Guid.Parse("60000000-0000-0000-0000-000000000005");
    public static readonly Guid ServiceDiagnosis = Guid.Parse("60000000-0000-0000-0000-000000000006");

    public static readonly Guid PartBrakePads = Guid.Parse("70000000-0000-0000-0000-000000000001");
    public static readonly Guid PartEngineOil = Guid.Parse("70000000-0000-0000-0000-000000000002");
    public static readonly Guid PartOilFilter = Guid.Parse("70000000-0000-0000-0000-000000000003");
    public static readonly Guid PartWiper = Guid.Parse("70000000-0000-0000-0000-000000000004");
    public static readonly Guid PartShock = Guid.Parse("70000000-0000-0000-0000-000000000005");

    public static readonly Guid JobKavithaToday = Guid.Parse("80000000-0000-0000-0000-000000000001");
    public static readonly Guid JobArunToday = Guid.Parse("80000000-0000-0000-0000-000000000002");
}
