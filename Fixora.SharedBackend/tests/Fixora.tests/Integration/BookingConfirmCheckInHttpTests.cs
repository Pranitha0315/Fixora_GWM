using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Application.Bookings;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("booking-confirm-checkin-http", DisableParallelization = true)]
public sealed class BookingConfirmCheckInHttpCollection;

/// <summary>
/// Conflict-safe tests-only: HTTP characterization of CURRENT Confirm vs CheckIn job timing.
/// Documents coded behaviour (job on CheckIn, not Confirm). Does NOT change production timing.
/// BookingService tip matches origin/Shared_Backend (identical blob).
/// </summary>
[Collection("booking-confirm-checkin-http")]
public sealed class BookingConfirmCheckInHttpTests
{
    private static FixoraFactory NewFactory() => new();

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

        throw new InvalidOperationException("No free demo slot for Confirm/CheckIn HTTP tests.");
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
                notes = "NID confirm/check-in characterize",
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
    public async Task Current_Confirm_does_not_create_job_card()
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
            $"http-confirm-nojobj-{Guid.NewGuid():N}");

        var confirm = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{booking.Id}/confirm",
            new ConfirmBookingRequest(DemoIds.Bay1, DemoIds.MechanicSenthil, "HTTP characterize"));
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var confirmed = (await confirm.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal("Confirmed", confirmed.Status);
        Assert.Null(confirmed.JobCardId);
        Assert.Equal(DemoIds.Bay1, confirmed.BayId);
        Assert.Equal(DemoIds.MechanicSenthil, confirmed.MechanicId);
    }

    [Fact]
    public async Task Current_CheckIn_before_Confirm_returns_conflict()
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
            $"http-checkin-early-{Guid.NewGuid():N}");

        var response = await manager.PostAsync(
            $"/api/v1/manager/bookings/{booking.Id}/check-in",
            null);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("booking_not_confirmed", error.Code);
    }

    [Fact]
    public async Task Current_Confirm_then_CheckIn_creates_and_links_job()
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
            $"http-confirm-checkin-{Guid.NewGuid():N}");

        var confirm = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{booking.Id}/confirm",
            new ConfirmBookingRequest(DemoIds.Bay2, DemoIds.MechanicSenthil, null));
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        Assert.Null((await confirm.Content.ReadFromJsonAsync<BookingDto>())!.JobCardId);

        var checkIn = await manager.PostAsync(
            $"/api/v1/manager/bookings/{booking.Id}/check-in",
            null);
        Assert.Equal(HttpStatusCode.OK, checkIn.StatusCode);
        var checkedIn = (await checkIn.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal("CheckedIn", checkedIn.Status);
        Assert.NotNull(checkedIn.JobCardId);

        var jobs = (await manager.GetFromJsonAsync<List<JobSummaryDto>>(
            "/api/v1/manager/jobs?activeOnly=true"))!;
        Assert.Contains(jobs, j => j.Id == checkedIn.JobCardId);
    }

    [Fact]
    public async Task Current_repeat_CheckIn_returns_conflict()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceAlignment);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleThreeWheeler,
            DemoIds.ServiceAlignment,
            slot,
            $"http-checkin-repeat-{Guid.NewGuid():N}");

        Assert.Equal(HttpStatusCode.OK,
            (await manager.PostAsJsonAsync(
                $"/api/v1/manager/bookings/{booking.Id}/confirm",
                new ConfirmBookingRequest(DemoIds.Bay1, DemoIds.MechanicKumar, null))).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await manager.PostAsync(
                $"/api/v1/manager/bookings/{booking.Id}/check-in", null)).StatusCode);

        var again = await manager.PostAsync(
            $"/api/v1/manager/bookings/{booking.Id}/check-in",
            null);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("booking_not_confirmed",
            (await again.Content.ReadFromJsonAsync<ApiErrorResponse>())!.Code);
    }

    [Fact]
    public async Task Customer_and_anonymous_cannot_confirm_or_check_in()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var manager = await factory.Manager();
        var anon = factory.CreateClient();

        var list = (await manager.GetFromJsonAsync<List<BookingDto>>(
            "/api/v1/manager/bookings?status=Requested"))!;
        var requested = Assert.Single(list, b =>
            b.CustomerId == DemoIds.CustomerArun
            && b.ServiceId == DemoIds.ServiceAlignment);

        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsJsonAsync(
                $"/api/v1/manager/bookings/{requested.Id}/confirm",
                new ConfirmBookingRequest(DemoIds.Bay1, DemoIds.MechanicRavi, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await kavitha.PostAsync(
                $"/api/v1/manager/bookings/{requested.Id}/check-in", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.PostAsJsonAsync(
                $"/api/v1/manager/bookings/{requested.Id}/confirm",
                new ConfirmBookingRequest(DemoIds.Bay1, DemoIds.MechanicRavi, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anon.PostAsync(
                $"/api/v1/manager/bookings/{requested.Id}/check-in", null)).StatusCode);
    }
}
