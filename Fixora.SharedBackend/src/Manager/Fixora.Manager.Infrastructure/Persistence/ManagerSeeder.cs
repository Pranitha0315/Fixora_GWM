using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Infrastructure.Persistence;

/// <summary>
/// Seeds the Northern Province pilot garage: 2 bays, services, staff, stock, 5 weeks of history
/// that plants the three demo insights (Thursday 2–5 PM idle, Kumar's comebacks, brake pads running out),
/// and today's two live jobs for the approval demo.
/// </summary>
public static class ManagerSeeder
{
    public static async Task SeedAsync(ManagerDbContext db, IPasswordService passwords, IClock clock, CancellationToken ct = default)
    {
        if (await db.Workshops.AnyAsync(ct)) return;
        var now = clock.UtcNow;

        var ws = new Workshop
        {
            Id = DemoIds.Workshop,
            Name = "Fixora Garage · Jaffna",
            Phone = "+94 21 222 3344",
            EmergencyPhone = "+94 77 555 0101",
            Address = "No. 42, Point Pedro Road, Jaffna",
            Lat = 9.6847,
            Lng = 80.0255,
        };
        db.Workshops.Add(ws);
        db.Bays.AddRange(new Bay { Id = DemoIds.Bay1, Name = "Bay 1", SortOrder = 1 }, new Bay { Id = DemoIds.Bay2, Name = "Bay 2", SortOrder = 2 });

        var services = new[]
        {
            new ServiceItem { Id = DemoIds.ServiceGeneral, Name = "General Service", Category = "Service", StandardMinutes = 90, BasePrice = 8500 },
            new ServiceItem { Id = DemoIds.ServiceBrake, Name = "Brake Inspection", Category = "Brakes", StandardMinutes = 60, BasePrice = 2500 },
            new ServiceItem { Id = DemoIds.ServiceOil, Name = "Engine Oil Change", Category = "Service", StandardMinutes = 45, BasePrice = 6500 },
            new ServiceItem { Id = DemoIds.ServiceAlignment, Name = "Wheel Alignment", Category = "Tyres", StandardMinutes = 45, BasePrice = 3000 },
            new ServiceItem { Id = DemoIds.ServiceSuspension, Name = "Suspension Check", Category = "Suspension", StandardMinutes = 60, BasePrice = 3500 },
            new ServiceItem { Id = DemoIds.ServiceDiagnosis, Name = "Full Diagnosis", Category = "Diagnosis", StandardMinutes = 60, BasePrice = 4000 },
        };
        db.Services.AddRange(services);

        db.Staff.AddRange(
            new StaffUser { Id = DemoIds.Owner, Name = "Suresh", Email = "owner@fixora.lk", Phone = "+94 77 123 0001", Role = Roles.Owner, PasswordHash = passwords.Hash("Fixora@123") },
            new StaffUser { Id = DemoIds.Manager, Name = "Nirosha", Email = "manager@fixora.lk", Phone = "+94 77 123 0002", Role = Roles.Manager, PasswordHash = passwords.Hash("Fixora@123") });

        db.Parts.AddRange(
            new Part { Id = DemoIds.PartBrakePads, Sku = "BP-AQUA-F", Name = "Aqua front brake pads", Category = "Brakes", Quantity = 2, ReorderLevel = 4, UnitCost = 3200, SellPrice = 4200, AvgWeeklyUsage = 7 },
            new Part { Id = DemoIds.PartEngineOil, Sku = "OIL-5W30-4L", Name = "Engine oil 5W-30 (4 L)", Category = "Service", Quantity = 18, ReorderLevel = 6, UnitCost = 5200, SellPrice = 6500, AvgWeeklyUsage = 6 },
            new Part { Id = DemoIds.PartOilFilter, Sku = "OF-SUZ", Name = "Oil filter (Suzuki)", Category = "Service", Quantity = 12, ReorderLevel = 5, UnitCost = 650, SellPrice = 950, AvgWeeklyUsage = 4 },
            new Part { Id = DemoIds.PartWiper, Sku = "WB-18", Name = "Wiper blades 18\" (pair)", Category = "Body", Quantity = 6, ReorderLevel = 2, UnitCost = 1100, SellPrice = 1800, AvgWeeklyUsage = 1 },
            new Part { Id = DemoIds.PartShock, Sku = "SA-WGR-F", Name = "Front shock absorber (Wagon R)", Category = "Suspension", Quantity = 4, ReorderLevel = 2, UnitCost = 9800, SellPrice = 12500, AvgWeeklyUsage = 1 });

        SeedToday(db, ws, now);

        db.Earnings.Add(new EarningsEntry { Kind = "ProSubscription", Amount = 5000, Reference = "Pro plan · this month", At = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc) });
        await db.SaveChangesAsync(ct);
    }

    private static void SeedToday(ManagerDbContext db, Workshop ws, DateTime now)
    {
        var localToday = ws.ToLocal(now).Date;

        // Kavitha's Wagon R: booked from a DriveSense brake suggestion, inspection in progress by Ravi (FixProof demo).
        var kavithaAppt = new Appointment
        {
            CustomerId = DemoIds.CustomerKavitha,
            CustomerName = "Kavitha",
            VehicleId = DemoIds.VehicleWagonR,
            VehicleLabel = "Suzuki Wagon R (NP CAB-4521)",
            ServiceId = DemoIds.ServiceBrake,
            ServiceName = "Brake Inspection",
            SlotStart = now.AddMinutes(-40),
            SlotEnd = now.AddMinutes(20),
            Status = AppointmentStatus.CheckedIn,
            Source = BookingSource.DriveSense,
            BayId = DemoIds.Bay1,
            MechanicId = DemoIds.MechanicRavi,
            Notes = "Brake inspection recommended by DriveSense (1.5× pad wear)",
            CreatedAt = now.AddDays(-2),
            DecidedAt = now.AddDays(-2),
            JobCardId = DemoIds.JobKavithaToday,
        };
        db.Appointments.Add(kavithaAppt);
        db.JobCards.Add(new JobCard
        {
            Id = DemoIds.JobKavithaToday,
            Number = $"JC-{now:yyyy}-0042",
            AppointmentId = kavithaAppt.Id,
            CustomerId = DemoIds.CustomerKavitha,
            CustomerName = "Kavitha",
            VehicleId = DemoIds.VehicleWagonR,
            VehicleLabel = kavithaAppt.VehicleLabel,
            MechanicId = DemoIds.MechanicRavi,
            BayId = DemoIds.Bay1,
            Status = JobStatus.Inspecting,
            Complaint = "Squeal when braking; DriveSense: harsh braking + pothole hits",
            EstimatedMinutes = 90,
            CreatedAt = now.AddMinutes(-35),
            StartedAt = now.AddMinutes(-30),
            RunningSince = now.AddMinutes(-30),
            QueueOrder = 1,
        });
        db.ProgressUpdates.AddRange(
            new ProgressUpdate { JobCardId = DemoIds.JobKavithaToday, Stage = "Checked in", Message = "Vehicle received at the workshop.", Percent = 5, ActorRole = Roles.Manager, ActorId = DemoIds.Manager, At = now.AddMinutes(-35) },
            new ProgressUpdate { JobCardId = DemoIds.JobKavithaToday, Stage = "Inspection", Message = "Ravi started the brake inspection.", Percent = 15, ActorRole = Roles.Mechanic, ActorId = DemoIds.MechanicRavi, At = now.AddMinutes(-30) });

        // Arun's Axio: waiting in the queue for Kumar.
        var arunAppt = new Appointment
        {
            CustomerId = DemoIds.CustomerArun,
            CustomerName = "Arun",
            VehicleId = DemoIds.VehicleArunAxio,
            VehicleLabel = "Toyota Axio (NP KX-2210)",
            ServiceId = DemoIds.ServiceGeneral,
            ServiceName = "General Service",
            SlotStart = now.AddMinutes(-10),
            SlotEnd = now.AddMinutes(80),
            Status = AppointmentStatus.CheckedIn,
            BayId = DemoIds.Bay2,
            MechanicId = DemoIds.MechanicKumar,
            CreatedAt = now.AddDays(-1),
            DecidedAt = now.AddDays(-1),
            JobCardId = DemoIds.JobArunToday,
        };
        db.Appointments.Add(arunAppt);
        db.JobCards.Add(new JobCard
        {
            Id = DemoIds.JobArunToday,
            Number = $"JC-{now:yyyy}-0043",
            AppointmentId = arunAppt.Id,
            CustomerId = DemoIds.CustomerArun,
            CustomerName = "Arun",
            VehicleId = DemoIds.VehicleArunAxio,
            VehicleLabel = arunAppt.VehicleLabel,
            MechanicId = DemoIds.MechanicKumar,
            BayId = DemoIds.Bay2,
            Status = JobStatus.Open,
            Complaint = "General Service",
            EstimatedMinutes = 90,
            CreatedAt = now.AddMinutes(-10),
            QueueOrder = 2,
        });

        // A request waiting for the manager (tomorrow 10:00 local).
        var tomorrow = localToday.AddDays(localToday.DayOfWeek == DayOfWeek.Saturday ? 2 : 1).AddHours(10);
        db.Appointments.Add(new Appointment
        {
            CustomerId = DemoIds.CustomerArun,
            CustomerName = "Arun",
            VehicleId = DemoIds.VehicleArunAxio,
            VehicleLabel = "Toyota Axio (NP KX-2210)",
            ServiceId = DemoIds.ServiceAlignment,
            ServiceName = "Wheel Alignment",
            SlotStart = ws.ToUtc(tomorrow),
            SlotEnd = ws.ToUtc(tomorrow).AddMinutes(45),
            Status = AppointmentStatus.Requested,
            Notes = "Car pulls to the left",
            CreatedAt = now.AddHours(-3),
        });
    }
}
