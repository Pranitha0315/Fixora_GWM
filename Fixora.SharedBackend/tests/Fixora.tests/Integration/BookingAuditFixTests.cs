using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Booking audit (25 Nov 2026, Manager Web) — BT01–BT11 re-written against the agreed contracts:
/// F01 mechanic must exist + be active (on-duty only for walk-ins) · F02 no mechanic/bay overlap on confirm (409)
/// F03 manager note stored separately, hidden from customers · F04 priority 0/1/2 · F05 active bay on walk-in
/// F06 date filter = workshop local date · F07 paged list { items, page, pageSize, total }.
/// BT09/BT09b characterize the current WalkIn F02 hole (no CapacityLock / EnsureResourcesFree) — tests only.
/// BT12 staff reschedule of Confirmed into mechanic overlap → 409 (Shared EnsureResourcesFree).
/// Each test uses its own far-future day so tests never collide with the demo seed or each other.
/// </summary>
[Collection("api")]
public class BookingAuditFixTests(FixoraFactory factory)
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private static HttpClient? manager; // one login for the whole class (auth rate limit)

    private async Task<HttpClient> Manager() => manager ??= await factory.Manager();

    /// <summary>A unique UTC instant: local 10:00 + hourOffset on (today + 200 + dayOffset) days.</summary>
    private static DateTime Day(int dayOffset, int localHour = 10)
    {
        var localDate = DateTime.UtcNow.Date.AddDays(200 + dayOffset);
        return DateTime.SpecifyKind(localDate.AddHours(localHour).AddMinutes(-330), DateTimeKind.Utc); // Sri Lanka = UTC+5:30
    }

    private async Task<Guid> SeedRequestedAsync(DateTime startUtc, int minutes = 60, string? customerNote = "Customer: brakes squeal")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        var a = new Appointment
        {
            CustomerId = DemoIds.CustomerKavitha, CustomerName = "Kavitha", VehicleId = DemoIds.VehicleWagonR, VehicleLabel = "Wagon R",
            ServiceId = DemoIds.ServiceBrake, ServiceName = "Brake service", SlotStart = startUtc, SlotEnd = startUtc.AddMinutes(minutes),
            Status = AppointmentStatus.Requested, Notes = customerNote,
        };
        db.Appointments.Add(a);
        await db.SaveChangesAsync();
        return a.Id;
    }

    private async Task<Guid> SeedInactiveBayAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        var bay = new Bay { Name = "Old bay (closed)", Active = false, SortOrder = 99 };
        db.Bays.Add(bay);
        await db.SaveChangesAsync();
        return bay.Id;
    }

    private async Task<HttpResponseMessage> Confirm(Guid bookingId, Guid bayId, Guid mechanicId, string? note = null)
        => await (await Manager()).PostAsJsonAsync($"/api/v1/manager/bookings/{bookingId}/confirm", new ConfirmBookingRequest(bayId, mechanicId, note));

    private static async Task<string?> ErrorCode(HttpResponseMessage res)
    {
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
    }

    private static WalkInRequest WalkIn(Guid bayId, Guid mechanicId, int priority = JobPriority.Normal) =>
        new(null, "Walk-in test", null, "WP CAB-1234", DemoIds.ServiceOil, bayId, mechanicId, priority, "Oil change");

    // BT01
    [Fact]
    public async Task BT01_valid_confirmation_succeeds()
    {
        var id = await SeedRequestedAsync(Day(1));
        var res = await Confirm(id, DemoIds.Bay1, DemoIds.MechanicRavi);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var dto = (await res.Content.ReadFromJsonAsync<BookingDto>(Web))!;
        Assert.Equal("Confirmed", dto.Status);
    }

    // BT02 / F01
    [Fact]
    public async Task BT02_unknown_mechanic_is_rejected()
    {
        var id = await SeedRequestedAsync(Day(2));
        var res = await Confirm(id, DemoIds.Bay1, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // BT03 / F01 — decision: a FUTURE booking may go to an off-duty (but active) mechanic.
    [Fact]
    public async Task BT03_off_duty_mechanic_is_allowed_for_a_future_booking()
    {
        var id = await SeedRequestedAsync(Day(3));
        var res = await Confirm(id, DemoIds.Bay1, DemoIds.MechanicSenthil); // Senthil is seeded off duty
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    // BT03b / F01 — a walk-in starts now, so the mechanic must be on duty.
    [Fact]
    public async Task BT03b_off_duty_mechanic_is_rejected_for_a_walk_in()
    {
        var res = await (await Manager()).PostAsJsonAsync("/api/v1/manager/bookings/walk-in", WalkIn(DemoIds.Bay1, DemoIds.MechanicSenthil));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // BT04 / F02
    [Fact]
    public async Task BT04_overlapping_mechanic_is_rejected_with_409()
    {
        var first = await SeedRequestedAsync(Day(4));
        var second = await SeedRequestedAsync(Day(4).AddMinutes(30));
        Assert.Equal(HttpStatusCode.OK, (await Confirm(first, DemoIds.Bay1, DemoIds.MechanicKumar)).StatusCode);

        var res = await Confirm(second, DemoIds.Bay2, DemoIds.MechanicKumar);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("mechanic_busy", await ErrorCode(res));
    }

    // BT05 / F02
    [Fact]
    public async Task BT05_overlapping_bay_is_rejected_with_409()
    {
        var first = await SeedRequestedAsync(Day(5));
        var second = await SeedRequestedAsync(Day(5).AddMinutes(30));
        Assert.Equal(HttpStatusCode.OK, (await Confirm(first, DemoIds.Bay2, DemoIds.MechanicRavi)).StatusCode);

        var res = await Confirm(second, DemoIds.Bay2, DemoIds.MechanicKumar);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("bay_busy", await ErrorCode(res));
    }

    // F02 — back-to-back (end == start) is NOT an overlap.
    [Fact]
    public async Task BT05b_back_to_back_bookings_are_allowed()
    {
        var first = await SeedRequestedAsync(Day(6), minutes: 60);
        var second = await SeedRequestedAsync(Day(6).AddMinutes(60), minutes: 60);
        Assert.Equal(HttpStatusCode.OK, (await Confirm(first, DemoIds.Bay1, DemoIds.MechanicRavi)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Confirm(second, DemoIds.Bay1, DemoIds.MechanicRavi)).StatusCode);
    }

    // BT12 / F02 — staff move of a Confirmed booking must respect mechanic/bay overlap.
    [Fact]
    public async Task BT12_staff_reschedule_confirmed_into_mechanic_overlap_is_409()
    {
        var slotA = Day(20);
        var slotB = Day(20).AddHours(3);
        var intoBusy = Day(20).AddMinutes(30);

        var first = await SeedRequestedAsync(slotA);
        var second = await SeedRequestedAsync(slotB);
        Assert.Equal(HttpStatusCode.OK, (await Confirm(first, DemoIds.Bay1, DemoIds.MechanicKumar)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Confirm(second, DemoIds.Bay2, DemoIds.MechanicKumar)).StatusCode);

        var res = await (await Manager()).PostAsJsonAsync(
            $"/api/v1/manager/bookings/{second}/reschedule",
            new RescheduleRequest(intoBusy));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("mechanic_busy", await ErrorCode(res));
    }

    // BT06 / F03
    [Fact]
    public async Task BT06_manager_note_is_stored_separately_and_hidden_from_the_customer()
    {
        var id = await SeedRequestedAsync(Day(7), customerNote: "Customer: brakes squeal");
        var res = await Confirm(id, DemoIds.Bay1, DemoIds.MechanicRavi, "  Check the rear drums too  ");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var dto = (await res.Content.ReadFromJsonAsync<BookingDto>(Web))!;
        Assert.Equal("Check the rear drums too", dto.ManagerNote);
        Assert.Equal("Customer: brakes squeal", dto.Notes); // customer note untouched

        var kavitha = await factory.Customer();
        var mine = (await kavitha.GetFromJsonAsync<List<BookingDto>>("/api/v1/customer/appointments", Web))!;
        var seen = Assert.Single(mine, b => b.Id == id);
        Assert.Null(seen.ManagerNote);
    }

    [Fact]
    public async Task BT06b_manager_note_over_500_characters_is_rejected()
    {
        var id = await SeedRequestedAsync(Day(8));
        var res = await Confirm(id, DemoIds.Bay1, DemoIds.MechanicRavi, new string('x', 501));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // BT07 / F04
    [Theory]
    [InlineData(999)]
    [InlineData(-1)]
    [InlineData(3)]
    public async Task BT07_invalid_walk_in_priority_is_rejected(int priority)
    {
        var res = await (await Manager()).PostAsJsonAsync("/api/v1/manager/bookings/walk-in", WalkIn(DemoIds.Bay1, DemoIds.MechanicRavi, priority));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // BT08 / F05
    [Fact]
    public async Task BT08_inactive_bay_is_rejected_for_a_walk_in()
    {
        var oldBay = await SeedInactiveBayAsync();
        var res = await (await Manager()).PostAsJsonAsync("/api/v1/manager/bookings/walk-in", WalkIn(oldBay, DemoIds.MechanicRavi));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task BT08b_valid_walk_in_with_urgent_priority_succeeds()
    {
        var res = await (await Manager()).PostAsJsonAsync("/api/v1/manager/bookings/walk-in", WalkIn(DemoIds.Bay1, DemoIds.MechanicRavi, JobPriority.Urgent));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var job = (await res.Content.ReadFromJsonAsync<JobSummaryDto>(Web))!;
        Assert.Equal(JobPriority.Urgent, job.Priority);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION (F02 hole): Confirm rejects mechanic overlap with 409, but WalkIn
    /// into the same mechanic/bay window still succeeds — WalkIn skips CapacityLock/EnsureResourcesFree.
    /// Characterization only; does not change BookingService.
    /// </summary>
    [Fact]
    public async Task BT09_current_walk_in_does_not_409_against_overlapping_confirmed()
    {
        var now = DateTime.UtcNow;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
            db.Appointments.Add(new Appointment
            {
                CustomerId = DemoIds.CustomerKavitha,
                CustomerName = "Kavitha",
                VehicleId = DemoIds.VehicleWagonR,
                VehicleLabel = "Wagon R",
                ServiceId = DemoIds.ServiceOil,
                ServiceName = "Oil change",
                SlotStart = now.AddMinutes(-30),
                SlotEnd = now.AddMinutes(90),
                Status = AppointmentStatus.Confirmed,
                BayId = DemoIds.Bay1,
                MechanicId = DemoIds.MechanicRavi,
                Notes = "bt09-overlap-anchor",
            });
            await db.SaveChangesAsync();
        }

        var walkIn = await (await Manager()).PostAsJsonAsync(
            "/api/v1/manager/bookings/walk-in",
            WalkIn(DemoIds.Bay1, DemoIds.MechanicRavi));
        Assert.Equal(HttpStatusCode.OK, walkIn.StatusCode);
        var job = (await walkIn.Content.ReadFromJsonAsync<JobSummaryDto>(Web))!;
        Assert.Equal(DemoIds.Bay1, job.BayId);
        Assert.Equal(DemoIds.MechanicRavi, job.MechanicId);
        Assert.Equal("Open", job.Status);
    }

    /// <summary>
    /// CURRENT IMPLEMENTATION (F02 hole): two back-to-back walk-ins on the same on-duty mechanic + active bay
    /// both succeed (no overlap gate). When THA adds WalkIn CapacityLock, expect the second to become 409.
    /// </summary>
    [Fact]
    public async Task BT09b_current_second_walk_in_same_mechanic_bay_still_succeeds()
    {
        var mgr = await Manager();
        var first = await mgr.PostAsJsonAsync(
            "/api/v1/manager/bookings/walk-in",
            new WalkInRequest(null, "Walk-in A", null, "WP CAB-A001", DemoIds.ServiceOil, DemoIds.Bay1, DemoIds.MechanicRavi, JobPriority.Normal, "first"));
        var second = await mgr.PostAsJsonAsync(
            "/api/v1/manager/bookings/walk-in",
            new WalkInRequest(null, "Walk-in B", null, "WP CAB-B002", DemoIds.ServiceOil, DemoIds.Bay1, DemoIds.MechanicRavi, JobPriority.Normal, "second"));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var jobA = (await first.Content.ReadFromJsonAsync<JobSummaryDto>(Web))!;
        var jobB = (await second.Content.ReadFromJsonAsync<JobSummaryDto>(Web))!;
        Assert.NotEqual(jobA.Id, jobB.Id);
        Assert.Equal(DemoIds.MechanicRavi, jobA.MechanicId);
        Assert.Equal(DemoIds.MechanicRavi, jobB.MechanicId);
        Assert.Equal(DemoIds.Bay1, jobA.BayId);
        Assert.Equal(DemoIds.Bay1, jobB.BayId);
    }

    // BT10 / F06 — local 00:30 belongs to the asked date; local 00:30 next day does not.
    [Fact]
    public async Task BT10_date_filter_uses_the_workshop_local_date()
    {
        var early = await SeedRequestedAsync(Day(10, localHour: 0).AddMinutes(30));   // 00:30 local = 19:00 UTC the day before
        var nextDay = await SeedRequestedAsync(Day(11, localHour: 0).AddMinutes(30));
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(210));

        var page = (await (await Manager()).GetFromJsonAsync<PagedResult<BookingDto>>($"/api/v1/manager/bookings?date={date:yyyy-MM-dd}&pageSize=100", Web))!;
        Assert.Contains(page.Items, b => b.Id == early);
        Assert.DoesNotContain(page.Items, b => b.Id == nextDay);
    }

    // BT11 / F07
    [Fact]
    public async Task BT11_list_is_paged_with_total()
    {
        for (var i = 0; i < 3; i++) await SeedRequestedAsync(Day(12).AddMinutes(i * 15), minutes: 10);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(212));
        var mgr = await Manager();

        var p1 = (await mgr.GetFromJsonAsync<PagedResult<BookingDto>>($"/api/v1/manager/bookings?date={date:yyyy-MM-dd}&page=1&pageSize=2", Web))!;
        var p2 = (await mgr.GetFromJsonAsync<PagedResult<BookingDto>>($"/api/v1/manager/bookings?date={date:yyyy-MM-dd}&page=2&pageSize=2", Web))!;
        Assert.Equal(3, p1.Total);
        Assert.Equal(2, p1.Items.Count);
        Assert.Single(p2.Items);
        Assert.Empty(p1.Items.Select(b => b.Id).Intersect(p2.Items.Select(b => b.Id)));

        var tooBig = await mgr.GetAsync($"/api/v1/manager/bookings?pageSize=101");
        Assert.Equal(HttpStatusCode.BadRequest, tooBig.StatusCode);
    }
}
