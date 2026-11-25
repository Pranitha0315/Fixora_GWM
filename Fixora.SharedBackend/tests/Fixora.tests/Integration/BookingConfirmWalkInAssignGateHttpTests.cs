using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Contracts;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Mechanic.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("booking-confirm-walkin-assign-gate-http", DisableParallelization = true)]
public sealed class BookingConfirmWalkInAssignGateHttpCollection;

/// <summary>
/// Characterization against Shared BookingAudit (F01/F05): Confirm/WalkIn now
/// reject unknown/inactive mechanic and inactive bay (aligned with Job Assign).
/// Tests-only; does not change Confirm/CheckIn job-creation timing.
/// </summary>
[Collection("booking-confirm-walkin-assign-gate-http")]
public sealed class BookingConfirmWalkInAssignGateHttpTests
{
    private static FixoraFactory NewFactory() => new();

    private static async Task SetMechanicActiveAsync(FixoraFactory factory, Guid mechanicId, bool active)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MechanicDbContext>();
        var mechanic = await db.Mechanics.SingleAsync(m => m.Id == mechanicId);
        mechanic.Active = active;
        await db.SaveChangesAsync();
    }

    private static async Task SetBayActiveAsync(FixoraFactory factory, Guid bayId, bool active)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
        var bay = await db.Bays.SingleAsync(b => b.Id == bayId);
        bay.Active = active;
        await db.SaveChangesAsync();
    }

    private static async Task<DateTime> FirstFreeSlotAsync(HttpClient client, Guid serviceId)
    {
        var localToday = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(330));
        for (var offset = 2; offset <= 21; offset++)
        {
            var day = localToday.AddDays(offset);
            if (day.DayOfWeek == DayOfWeek.Sunday)
            {
                continue;
            }

            var slots = await client.GetFromJsonAsync<List<SlotDto>>(
                $"/api/v1/customer/appointments/slots?date={day:yyyy-MM-dd}&serviceId={serviceId}");
            var slot = slots?.FirstOrDefault(s => s.FreeBays >= 1);
            if (slot is not null)
            {
                return slot.Start;
            }
        }

        throw new InvalidOperationException("No free demo slot for Confirm/WalkIn gate HTTP tests.");
    }

    private static async Task<BookingDto> BookAsync(
        HttpClient client,
        Guid vehicleId,
        Guid serviceId,
        DateTime slotStart,
        string idempotencyKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/customer/appointments")
        {
            Content = JsonContent.Create(new
            {
                vehicleId,
                serviceId,
                slotStart,
                notes = "NID confirm/walk-in assign-gate characterize",
                promoCode = (string?)null,
                suggestionId = (Guid?)null
            })
        };
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<BookingDto>())!;
    }

    [Fact]
    public async Task Current_Confirm_rejects_unknown_mechanic_guid()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceOil,
            slot,
            $"http-confirm-unk-mech-{Guid.NewGuid():N}");

        var unknownMechanic = Guid.NewGuid();
        var confirm = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{booking.Id}/confirm",
            new ConfirmBookingRequest(DemoIds.Bay1, unknownMechanic, null));
        Assert.Equal(HttpStatusCode.BadRequest, confirm.StatusCode);
    }

    [Fact]
    public async Task Current_Confirm_rejects_inactive_mechanic()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleThreeWheeler,
            DemoIds.ServiceOil,
            slot,
            $"http-confirm-inact-mech-{Guid.NewGuid():N}");

        await SetMechanicActiveAsync(factory, DemoIds.MechanicSenthil, active: false);
        try
        {
            var confirm = await manager.PostAsJsonAsync(
                $"/api/v1/manager/bookings/{booking.Id}/confirm",
                new ConfirmBookingRequest(DemoIds.Bay1, DemoIds.MechanicSenthil, null));
            Assert.Equal(HttpStatusCode.BadRequest, confirm.StatusCode);
        }
        finally
        {
            await SetMechanicActiveAsync(factory, DemoIds.MechanicSenthil, active: true);
        }
    }

    [Fact]
    public async Task Current_Confirm_rejects_inactive_bay()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceDiagnosis);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceDiagnosis,
            slot,
            $"http-confirm-inact-bay-{Guid.NewGuid():N}");

        await SetBayActiveAsync(factory, DemoIds.Bay2, active: false);
        try
        {
            var confirm = await manager.PostAsJsonAsync(
                $"/api/v1/manager/bookings/{booking.Id}/confirm",
                new ConfirmBookingRequest(DemoIds.Bay2, DemoIds.MechanicSenthil, null));
            Assert.Equal(HttpStatusCode.BadRequest, confirm.StatusCode);
        }
        finally
        {
            await SetBayActiveAsync(factory, DemoIds.Bay2, active: true);
        }
    }

    [Fact]
    public async Task Current_WalkIn_rejects_inactive_bay_and_inactive_mechanic()
    {
        await using var factory = NewFactory();
        var manager = await factory.Manager();

        await SetBayActiveAsync(factory, DemoIds.Bay2, active: false);
        await SetMechanicActiveAsync(factory, DemoIds.MechanicSenthil, active: false);
        try
        {
            var walkIn = await manager.PostAsJsonAsync(
                "/api/v1/manager/bookings/walk-in",
                new
                {
                    customerId = (Guid?)null,
                    customerName = "Walk-in gate NID",
                    vehicleId = (Guid?)null,
                    vehicleLabel = "Gate Test Car",
                    serviceId = DemoIds.ServiceOil,
                    bayId = DemoIds.Bay2,
                    mechanicId = DemoIds.MechanicSenthil,
                    priority = 0,
                    complaint = "characterize gated walk-in"
                });
            Assert.Equal(HttpStatusCode.BadRequest, walkIn.StatusCode);
        }
        finally
        {
            await SetBayActiveAsync(factory, DemoIds.Bay2, active: true);
            await SetMechanicActiveAsync(factory, DemoIds.MechanicSenthil, active: true);
        }
    }
}
