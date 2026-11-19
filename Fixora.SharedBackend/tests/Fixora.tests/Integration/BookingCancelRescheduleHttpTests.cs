using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Manager.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("booking-cancel-reschedule-http", DisableParallelization = true)]
public sealed class BookingCancelRescheduleHttpCollection;

/// <summary>
/// FX13-D04-NID-2 HTTP: cancel / reschedule against current customer and manager booking routes.
/// Isolated <see cref="FixoraFactory"/> so booking seeds do not pollute the shared api collection fixture.
/// </summary>
[Collection("booking-cancel-reschedule-http")]
public sealed class BookingCancelRescheduleHttpTests : IAsyncLifetime
{
    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private static async Task<ApiErrorResponse> ReadErrorAsync(HttpResponseMessage response)
    {
        var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>();
        Assert.NotNull(error);
        return error!;
    }

    private async Task<HttpClient> ArunAsync()
        => await _factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static async Task<DateTime> FirstFreeSlotAsync(HttpClient client, Guid serviceId, int minFreeBays = 1)
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
            var slot = slots?.FirstOrDefault(s => s.FreeBays >= minFreeBays);
            if (slot is not null)
            {
                return slot.Start;
            }
        }

        throw new InvalidOperationException("No free demo slot found for booking HTTP tests.");
    }

    private static async Task<BookingDto> BookAsync(
        HttpClient client,
        Guid vehicleId,
        Guid serviceId,
        DateTime slotStart,
        string idempotencyKey,
        string? notes = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/customer/appointments")
        {
            Content = JsonContent.Create(new
            {
                vehicleId,
                serviceId,
                slotStart,
                notes,
                promoCode = (string?)null,
                suggestionId = (Guid?)null
            })
        };
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var booking = await response.Content.ReadFromJsonAsync<BookingDto>();
        Assert.NotNull(booking);
        return booking!;
    }

    private async Task<BookingDto?> FindCustomerBookingAsync(HttpClient client, Guid bookingId)
    {
        var list = await client.GetFromJsonAsync<List<BookingDto>>("/api/v1/customer/appointments");
        return list?.SingleOrDefault(b => b.Id == bookingId);
    }

    private async Task SeedNearCutoffRequestedAsync(Guid customerId, string customerName, Guid vehicleId, string vehicleLabel)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
        var now = DateTime.UtcNow;
        db.Appointments.Add(new Appointment
        {
            CustomerId = customerId,
            CustomerName = customerName,
            VehicleId = vehicleId,
            VehicleLabel = vehicleLabel,
            ServiceId = DemoIds.ServiceOil,
            ServiceName = "Engine Oil Change",
            SlotStart = now.AddMinutes(90),
            SlotEnd = now.AddMinutes(135),
            Status = AppointmentStatus.Requested,
            Notes = "Cutoff HTTP fixture",
            CreatedAt = now
        });
        await db.SaveChangesAsync();
    }

    private async Task<Guid> LatestSeededCutoffBookingIdAsync(Guid customerId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ManagerDbContext>();
        return await db.Appointments
            .Where(a => a.CustomerId == customerId && a.Notes == "Cutoff HTTP fixture")
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => a.Id)
            .FirstAsync();
    }

    [Fact]
    public async Task Customer_can_cancel_own_eligible_booking()
    {
        var kavitha = await _factory.Customer();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceOil,
            slot,
            $"http-cancel-own-{Guid.NewGuid():N}");

        var response = await kavitha.PostAsync($"/api/v1/customer/appointments/{booking.Id}/cancel", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = (await response.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal(nameof(AppointmentStatus.Cancelled), dto.Status);
        Assert.Equal(booking.Id, dto.Id);

        var stored = await FindCustomerBookingAsync(kavitha, booking.Id);
        Assert.NotNull(stored);
        Assert.Equal(nameof(AppointmentStatus.Cancelled), stored!.Status);
    }

    [Fact]
    public async Task Other_customer_cannot_cancel_or_reschedule_booking()
    {
        var kavitha = await _factory.Customer();
        var arun = await ArunAsync();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceOil,
            slot,
            $"http-other-{Guid.NewGuid():N}");

        var cancel = await arun.PostAsync($"/api/v1/customer/appointments/{booking.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.NotFound, cancel.StatusCode);
        var cancelError = await ReadErrorAsync(cancel);
        Assert.Equal(404, cancelError.Status);
        Assert.Equal("not_found", cancelError.Code);

        var altSlot = await FirstFreeSlotAsync(arun, DemoIds.ServiceAlignment);
        var reschedule = await arun.PostAsJsonAsync(
            $"/api/v1/customer/appointments/{booking.Id}/reschedule",
            new { slotStart = altSlot });
        Assert.Equal(HttpStatusCode.NotFound, reschedule.StatusCode);
        var rescheduleError = await ReadErrorAsync(reschedule);
        Assert.Equal(404, rescheduleError.Status);
        Assert.Equal("not_found", rescheduleError.Code);

        var stored = await FindCustomerBookingAsync(kavitha, booking.Id);
        Assert.NotNull(stored);
        Assert.Equal(nameof(AppointmentStatus.Requested), stored!.Status);
        Assert.Equal(booking.SlotStart, stored.SlotStart);
    }

    [Fact]
    public async Task Unauthenticated_cancel_and_reschedule_return_unauthorized()
    {
        var client = _factory.CreateClient();
        var id = Guid.NewGuid();

        var cancel = await client.PostAsync($"/api/v1/customer/appointments/{id}/cancel", null);
        Assert.Equal(HttpStatusCode.Unauthorized, cancel.StatusCode);

        var reschedule = await client.PostAsJsonAsync(
            $"/api/v1/customer/appointments/{id}/reschedule",
            new { slotStart = DateTime.UtcNow.AddDays(3) });
        Assert.Equal(HttpStatusCode.Unauthorized, reschedule.StatusCode);

        var managerCancel = await client.PostAsync($"/api/v1/manager/bookings/{id}/cancel", null);
        Assert.Equal(HttpStatusCode.Unauthorized, managerCancel.StatusCode);
    }

    [Fact]
    public async Task Customer_can_reschedule_own_eligible_booking()
    {
        var kavitha = await _factory.Customer();
        var first = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil, minFreeBays: 1);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceOil,
            first,
            $"http-resched-own-{Guid.NewGuid():N}");

        var second = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil, minFreeBays: 1);
        if (second == first)
        {
            // Pick a later free slot on a farther day if the first free window was reused.
            second = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceDiagnosis, minFreeBays: 1);
        }

        // Prefer a distinct slot for ServiceOil by scanning after the booked start.
        var localToday = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(330));
        for (var offset = 2; offset <= 21; offset++)
        {
            var day = localToday.AddDays(offset);
            if (day.DayOfWeek == DayOfWeek.Sunday)
            {
                continue;
            }

            var slots = await kavitha.GetFromJsonAsync<List<SlotDto>>(
                $"/api/v1/customer/appointments/slots?date={day:yyyy-MM-dd}&serviceId={DemoIds.ServiceOil}");
            var candidate = slots?.FirstOrDefault(s => s.Start != first && s.FreeBays >= 1);
            if (candidate is not null)
            {
                second = candidate.Start;
                break;
            }
        }

        Assert.NotEqual(first, second);

        var response = await kavitha.PostAsJsonAsync(
            $"/api/v1/customer/appointments/{booking.Id}/reschedule",
            new { slotStart = second });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = (await response.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal(second, dto.SlotStart);
        Assert.Equal(nameof(AppointmentStatus.Requested), dto.Status);

        var stored = await FindCustomerBookingAsync(kavitha, booking.Id);
        Assert.NotNull(stored);
        Assert.Equal(second, stored!.SlotStart);
    }

    [Fact]
    public async Task Reschedule_into_full_slot_returns_slot_full_without_mutating()
    {
        var kavitha = await _factory.Customer();
        var arun = await ArunAsync();
        var fullSlot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil, minFreeBays: 2);

        await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceOil,
            fullSlot,
            $"http-full-a-{Guid.NewGuid():N}");
        await BookAsync(
            arun,
            DemoIds.VehicleArunAxio,
            DemoIds.ServiceOil,
            fullSlot,
            $"http-full-b-{Guid.NewGuid():N}");

        var altSlot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceBrake, minFreeBays: 1);
        var movable = await BookAsync(
            kavitha,
            DemoIds.VehicleThreeWheeler,
            DemoIds.ServiceBrake,
            altSlot,
            $"http-full-move-{Guid.NewGuid():N}");

        var before = await FindCustomerBookingAsync(kavitha, movable.Id);
        Assert.NotNull(before);

        var beforeNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        var beforeIds = beforeNotifications.Select(n => n.Id).ToHashSet();

        var response = await kavitha.PostAsJsonAsync(
            $"/api/v1/customer/appointments/{movable.Id}/reschedule",
            new { slotStart = fullSlot });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await ReadErrorAsync(response);
        Assert.Equal(409, error.Status);
        Assert.Equal("slot_full", error.Code);

        var after = await FindCustomerBookingAsync(kavitha, movable.Id);
        Assert.NotNull(after);
        Assert.Equal(before!.SlotStart, after!.SlotStart);
        Assert.Equal(before.Status, after.Status);

        var afterNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        Assert.DoesNotContain(
            afterNotifications,
            n => !beforeIds.Contains(n.Id) &&
                 n.Type == NotificationTypes.BookingRequested &&
                 n.Title == "Booking moved");
    }

    [Fact]
    public async Task Customer_cancel_within_cutoff_returns_cancel_cutoff()
    {
        // Start the isolated host before mutating ManagerDbContext (same pattern as assign HTTP tests).
        var kavitha = await _factory.Customer();
        await SeedNearCutoffRequestedAsync(
            DemoIds.CustomerKavitha,
            "Kavitha",
            DemoIds.VehicleWagonR,
            "Suzuki Wagon R (NP CAB-4521)");
        var bookingId = await LatestSeededCutoffBookingIdAsync(DemoIds.CustomerKavitha);

        var beforeNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        var beforeIds = beforeNotifications.Select(n => n.Id).ToHashSet();

        var response = await kavitha.PostAsync($"/api/v1/customer/appointments/{bookingId}/cancel", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await ReadErrorAsync(response);
        Assert.Equal(409, error.Status);
        Assert.Equal("cancel_cutoff", error.Code);

        var stored = await FindCustomerBookingAsync(kavitha, bookingId);
        Assert.NotNull(stored);
        Assert.Equal(nameof(AppointmentStatus.Requested), stored!.Status);

        var afterNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        Assert.DoesNotContain(
            afterNotifications,
            n => !beforeIds.Contains(n.Id) && n.Type == NotificationTypes.BookingCancelled);
    }

    [Fact]
    public async Task Declined_booking_cancel_returns_booking_not_cancellable()
    {
        var kavitha = await _factory.Customer();
        var manager = await _factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceSuspension);
        var booking = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceSuspension,
            slot,
            $"http-declined-{Guid.NewGuid():N}");

        var decline = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{booking.Id}/decline",
            new { reason = "No capacity for that service window" });
        Assert.Equal(HttpStatusCode.OK, decline.StatusCode);

        var beforeNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        var beforeIds = beforeNotifications.Select(n => n.Id).ToHashSet();

        var response = await kavitha.PostAsync($"/api/v1/customer/appointments/{booking.Id}/cancel", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = await ReadErrorAsync(response);
        Assert.Equal(409, error.Status);
        Assert.Equal("booking_not_cancellable", error.Code);

        var stored = await FindCustomerBookingAsync(kavitha, booking.Id);
        Assert.NotNull(stored);
        Assert.Equal(nameof(AppointmentStatus.Declined), stored!.Status);

        var afterNotifications = (await kavitha.GetFromJsonAsync<List<NotificationDto>>(
            "/api/v1/notifications?take=200"))!;
        Assert.DoesNotContain(
            afterNotifications,
            n => !beforeIds.Contains(n.Id) && n.Type == NotificationTypes.BookingCancelled);
    }

    [Fact]
    public async Task Manager_can_cancel_and_reschedule_bookings()
    {
        var kavitha = await _factory.Customer();
        var manager = await _factory.Manager();
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceDiagnosis);
        var toCancel = await BookAsync(
            kavitha,
            DemoIds.VehicleWagonR,
            DemoIds.ServiceDiagnosis,
            slot,
            $"http-mgr-cancel-{Guid.NewGuid():N}");

        var cancel = await manager.PostAsync($"/api/v1/manager/bookings/{toCancel.Id}/cancel", null);
        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        var cancelled = (await cancel.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal(nameof(AppointmentStatus.Cancelled), cancelled.Status);

        var confirmSlot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceOil);
        var toMove = await BookAsync(
            kavitha,
            DemoIds.VehicleThreeWheeler,
            DemoIds.ServiceOil,
            confirmSlot,
            $"http-mgr-move-{Guid.NewGuid():N}");

        var confirm = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{toMove.Id}/confirm",
            new { bayId = DemoIds.Bay1, mechanicId = DemoIds.MechanicRavi, note = (string?)null });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);

        DateTime newSlot = confirmSlot;
        var localToday = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(330));
        for (var offset = 2; offset <= 21; offset++)
        {
            var day = localToday.AddDays(offset);
            if (day.DayOfWeek == DayOfWeek.Sunday)
            {
                continue;
            }

            var slots = await manager.GetFromJsonAsync<List<SlotDto>>(
                $"/api/v1/manager/bookings/slots?date={day:yyyy-MM-dd}&serviceId={DemoIds.ServiceOil}");
            var candidate = slots?.FirstOrDefault(s => s.Start != confirmSlot && s.FreeBays >= 1);
            if (candidate is not null)
            {
                newSlot = candidate.Start;
                break;
            }
        }

        Assert.NotEqual(confirmSlot, newSlot);

        var reschedule = await manager.PostAsJsonAsync(
            $"/api/v1/manager/bookings/{toMove.Id}/reschedule",
            new { slotStart = newSlot });

        Assert.Equal(HttpStatusCode.OK, reschedule.StatusCode);
        var moved = (await reschedule.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal(newSlot, moved.SlotStart);
        Assert.Equal(nameof(AppointmentStatus.Confirmed), moved.Status);
    }

    [Fact]
    public async Task Mechanic_token_cannot_use_manager_booking_cancel()
    {
        var mechanic = await _factory.Mechanic();
        var response = await mechanic.PostAsync(
            $"/api/v1/manager/bookings/{Guid.NewGuid()}/cancel",
            null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
