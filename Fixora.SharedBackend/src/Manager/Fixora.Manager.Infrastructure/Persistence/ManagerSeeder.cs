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
    private static readonly string[] Names = { "Nimal", "Rajan", "Priya", "Sutharsan", "Mathi", "Kannan", "Lakshmi", "Dinesh", "Vithya", "Ganesh", "Shan", "Tharani" };
    private static readonly string[] Cars = { "Suzuki Alto", "Toyota Vitz", "Toyota Axio", "Toyota Prius", "Mahindra Bolero", "Bajaj RE", "Honda Fit", "Nissan Leaf" };

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

        SeedHistory(db, ws, services, now);
        SeedToday(db, ws, now);

        db.Earnings.Add(new EarningsEntry { Kind = "ProSubscription", Amount = 5000, Reference = "Pro plan · this month", At = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc) });
        await db.SaveChangesAsync(ct);
    }

    private static void SeedHistory(ManagerDbContext db, Workshop ws, ServiceItem[] services, DateTime now)
    {
        var rnd = new Random(2026);
        var mechanics = new[] { DemoIds.MechanicRavi, DemoIds.MechanicSenthil, DemoIds.MechanicKumar };
        var jobNo = 0;
        var invNo = 0;
        var brakePadJobs = 0;
        var history = new List<JobCard>();
        var localToday = ws.ToLocal(now).Date;

        // Two bookings per window per day, except Thursday afternoon (one) → the planted IdleSlot insight.
        var starts = new[] { (8, 30), (9, 0), (11, 30), (12, 0), (14, 30), (15, 0) };
        for (var d = 35; d >= 1; d--)
        {
            var day = localToday.AddDays(-d);
            if (day.DayOfWeek == DayOfWeek.Sunday) continue;
            foreach (var (h, m) in starts)
            {
                if (day.DayOfWeek == DayOfWeek.Thursday && h == 15) continue;
                var svc = services[rnd.Next(services.Length)];
                var mech = mechanics[rnd.Next(mechanics.Length)];
                var start = ws.ToUtc(day.AddHours(h).AddMinutes(m));
                var noShow = rnd.Next(40) == 0;
                var job = AddCompleted(db, ref jobNo, ref invNo, Guid.NewGuid(), $"{Names[rnd.Next(Names.Length)]}", Guid.NewGuid(),
                    $"{Cars[rnd.Next(Cars.Length)]} (NP {(char)('A' + rnd.Next(26))}{(char)('A' + rnd.Next(26))}-{rnd.Next(1000, 9999)})",
                    svc, mech, start, TimeSpan.FromHours(2), noShow);

                if (job is null) continue;
                history.Add(job);
                if (svc.Id == DemoIds.ServiceBrake && d <= 28 && brakePadJobs < 4)
                {
                    brakePadJobs++;
                    db.StockMovements.Add(new StockMovement { PartId = DemoIds.PartBrakePads, JobCardId = job.Id, Delta = -1, Reason = "Brake pads fitted", At = start.AddHours(1) });
                }
            }
        }
        // Guarantee the StockOut evidence even if the random mix had few brake jobs.
        for (var i = brakePadJobs; i < 3; i++)
            db.StockMovements.Add(new StockMovement { PartId = DemoIds.PartBrakePads, JobCardId = history[history.Count - 1 - 5 * (i + 1)].Id, Delta = -1, Reason = "Brake pads fitted", At = now.AddDays(-5 - i) });

        // Planted ComebackSpike: three wheel alignments by Kumar came back within 30 days.
        var alignment = services.First(s => s.Id == DemoIds.ServiceAlignment);
        for (var i = 0; i < 3; i++)
        {
            var vehicle = Guid.NewGuid();
            var customer = Guid.NewGuid();
            var label = $"{Cars[i + 1]} (NP K{i}-77{i}{i})";
            AddCompleted(db, ref jobNo, ref invNo, customer, Names[i + 3], vehicle, label, alignment, DemoIds.MechanicKumar,
                ws.ToUtc(localToday.AddDays(-22 + i).AddHours(10)), TimeSpan.FromMinutes(45), false);
            AddCompleted(db, ref jobNo, ref invNo, customer, Names[i + 3], vehicle, label, alignment, DemoIds.MechanicSenthil,
                ws.ToUtc(localToday.AddDays(-9 + i).AddHours(10)), TimeSpan.FromMinutes(45), false);
        }
    }

    private static JobCard? AddCompleted(ManagerDbContext db, ref int jobNo, ref int invNo, Guid customerId, string customerName, Guid vehicleId, string vehicleLabel,
        ServiceItem svc, Guid mechanicId, DateTime start, TimeSpan length, bool noShow)
    {
        var appt = new Appointment
        {
            CustomerId = customerId,
            CustomerName = customerName,
            VehicleId = vehicleId,
            VehicleLabel = vehicleLabel,
            ServiceId = svc.Id,
            ServiceName = svc.Name,
            SlotStart = start,
            SlotEnd = start + length,
            Status = noShow ? AppointmentStatus.NoShow : AppointmentStatus.Completed,
            BayId = jobNo % 2 == 0 ? DemoIds.Bay1 : DemoIds.Bay2,
            MechanicId = mechanicId,
            CreatedAt = start.AddDays(-2),
            DecidedAt = start.AddDays(-2),
        };
        db.Appointments.Add(appt);
        if (noShow) return null;

        jobNo++;
        var job = new JobCard
        {
            Number = $"JC-{start:yyyy}-H{jobNo:0000}",
            AppointmentId = appt.Id,
            CustomerId = customerId,
            CustomerName = customerName,
            VehicleId = vehicleId,
            VehicleLabel = vehicleLabel,
            MechanicId = mechanicId,
            BayId = appt.BayId,
            Status = JobStatus.Closed,
            Complaint = svc.Name,
            EstimatedMinutes = svc.StandardMinutes,
            CreatedAt = start,
            StartedAt = start,
            WorkedMinutes = length.TotalMinutes,
            CompletedAt = start + length,
        };
        appt.JobCardId = job.Id;
        db.JobCards.Add(job);

        invNo++;
        var invoice = new Invoice
        {
            JobCardId = job.Id,
            CustomerId = customerId,
            Number = $"INV-{start:yyyy}-H{invNo:0000}",
            Subtotal = svc.BasePrice,
            Total = svc.BasePrice,
            Status = InvoiceStatus.Paid,
            PaymentMethod = invNo % 3 == 0 ? "BankTransfer" : "Cash",
            IssuedAt = start + length,
            PaidAt = start + length,
        };
        invoice.Lines.Add(new InvoiceLine { InvoiceId = invoice.Id, Description = svc.Name, Qty = 1, UnitPrice = svc.BasePrice, Amount = svc.BasePrice });
        db.Invoices.Add(invoice);
        return job;
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
