using System.Net;
using System.Net.Http.Json;
using Fixora.Customer.Application.DriveSense;
using Fixora.Manager.Contracts;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("drivesense-suggestion-http", DisableParallelization = true)]
public sealed class DriveSenseSuggestionHttpCollection;

/// <summary>
/// FX13-D09-NID-2 Slice 1 (tests-only): characterize maintenance suggestion list/dismiss
/// and one-tap book → DriveSense booking attribution. Does not edit THA weekly workers,
/// suggestion engine production, or Shared_Backend-divergent files.
/// </summary>
[Collection("drivesense-suggestion-http")]
public sealed class DriveSenseSuggestionHttpTests
{
    private const string SuggestionsUrl = "/api/v1/customer/suggestions";

    private static FixoraFactory NewFactory() => new();

    private static async Task<HttpClient> ArunAsync(FixoraFactory factory)
        => await factory.LoginAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private static async Task<SuggestionDto> KavithaOpenSuspensionAsync(HttpClient kavitha)
    {
        var list = await kavitha.GetFromJsonAsync<List<SuggestionDto>>(SuggestionsUrl);
        Assert.NotNull(list);
        var open = list!.SingleOrDefault(s =>
            s.Status == "Open"
            && s.VehicleId == DemoIds.VehicleWagonR
            && s.Component == "Suspension");
        Assert.NotNull(open);
        return open!;
    }

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

        throw new InvalidOperationException("No free demo slot found for suggestion booking HTTP tests.");
    }

    [Fact]
    public async Task Kavitha_lists_seeded_open_suspension_suggestion()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        var response = await kavitha.GetAsync(SuggestionsUrl);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var list = (await response.Content.ReadFromJsonAsync<List<SuggestionDto>>())!;
        var open = list.Single(s => s.Status == "Open" && s.Component == "Suspension");
        Assert.Equal(DemoIds.VehicleWagonR, open.VehicleId);
        Assert.Equal(DemoIds.ServiceSuspension, open.SuggestedServiceId);
        Assert.Contains("rough roads", open.Reason, StringComparison.OrdinalIgnoreCase);
        Assert.True(open.WearFactor >= 1.0);
    }

    [Fact]
    public async Task Book_open_suggestion_attributes_booking_as_DriveSense_and_closes_suggestion()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var suggestion = await KavithaOpenSuspensionAsync(kavitha);
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceSuspension);
        var key = $"d09-nid-2-book-{Guid.NewGuid():N}";

        var request = new HttpRequestMessage(HttpMethod.Post, $"{SuggestionsUrl}/{suggestion.Id}/book")
        {
            Content = JsonContent.Create(new BookSuggestionRequest(slot))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);

        var response = await kavitha.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var booking = (await response.Content.ReadFromJsonAsync<BookingDto>())!;
        Assert.Equal("DriveSense", booking.Source);
        Assert.Equal(DemoIds.VehicleWagonR, booking.VehicleId);
        Assert.Equal(DemoIds.ServiceSuspension, booking.ServiceId);
        Assert.Equal(slot, booking.SlotStart);
        Assert.Contains("DriveSense:", booking.Notes ?? "", StringComparison.Ordinal);

        var after = (await kavitha.GetFromJsonAsync<List<SuggestionDto>>(SuggestionsUrl))!;
        var closed = after.Single(s => s.Id == suggestion.Id);
        Assert.Equal("Booked", closed.Status);
    }

    [Fact]
    public async Task Rebook_closed_suggestion_returns_suggestion_closed()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var suggestion = await KavithaOpenSuspensionAsync(kavitha);
        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceSuspension);

        var first = new HttpRequestMessage(HttpMethod.Post, $"{SuggestionsUrl}/{suggestion.Id}/book")
        {
            Content = JsonContent.Create(new BookSuggestionRequest(slot))
        };
        first.Headers.TryAddWithoutValidation("Idempotency-Key", $"d09-book-1-{Guid.NewGuid():N}");
        (await kavitha.SendAsync(first)).EnsureSuccessStatusCode();

        var second = new HttpRequestMessage(HttpMethod.Post, $"{SuggestionsUrl}/{suggestion.Id}/book")
        {
            Content = JsonContent.Create(new BookSuggestionRequest(slot))
        };
        second.Headers.TryAddWithoutValidation("Idempotency-Key", $"d09-book-2-{Guid.NewGuid():N}");
        var response = await kavitha.SendAsync(second);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("suggestion_closed", error.Code);
    }

    [Fact]
    public async Task Dismiss_open_suggestion_marks_dismissed_and_blocks_book()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var suggestion = await KavithaOpenSuspensionAsync(kavitha);

        var dismiss = await kavitha.PostAsync($"{SuggestionsUrl}/{suggestion.Id}/dismiss", null);
        Assert.Equal(HttpStatusCode.OK, dismiss.StatusCode);
        var dismissed = (await dismiss.Content.ReadFromJsonAsync<SuggestionDto>())!;
        Assert.Equal("Dismissed", dismissed.Status);

        var slot = await FirstFreeSlotAsync(kavitha, DemoIds.ServiceSuspension);
        var book = new HttpRequestMessage(HttpMethod.Post, $"{SuggestionsUrl}/{suggestion.Id}/book")
        {
            Content = JsonContent.Create(new BookSuggestionRequest(slot))
        };
        book.Headers.TryAddWithoutValidation("Idempotency-Key", $"d09-dismiss-book-{Guid.NewGuid():N}");
        var response = await kavitha.SendAsync(book);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("suggestion_closed", error.Code);
    }

    [Fact]
    public async Task Anonymous_list_returns_unauthorized()
    {
        await using var factory = NewFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync(SuggestionsUrl);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Other_customer_cannot_book_foreign_suggestion()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();
        var arun = await ArunAsync(factory);
        var suggestion = await KavithaOpenSuspensionAsync(kavitha);
        var slot = await FirstFreeSlotAsync(arun, DemoIds.ServiceSuspension);

        var request = new HttpRequestMessage(HttpMethod.Post, $"{SuggestionsUrl}/{suggestion.Id}/book")
        {
            Content = JsonContent.Create(new BookSuggestionRequest(slot))
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", $"d09-foreign-{Guid.NewGuid():N}");

        var response = await arun.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiErrorResponse>())!;
        Assert.Equal("not_found", error.Code);
    }
}
