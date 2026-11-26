using System.Net;
using System.Net.Http.Json;
using Fixora.Manager.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

[CollectionDefinition("contract-mismatch-http", DisableParallelization = true)]
public sealed class ContractMismatchCharacterizationCollection;

/// <summary>
/// FX13-D13-NID-1 (tests-only): characterize known differences between the proposed cross-app
/// contract (Doc/architecture/cross-app-contracts.md) and the current Shared backend.
/// Asserts observed behaviour only; does not change production code or claim the proposal is met.
/// </summary>
[Collection("contract-mismatch-http")]
public sealed class ContractMismatchCharacterizationTests
{
    private const string BookingsUrl = "/api/v1/customer/appointments";
    private const string InvitationCheckUrl = "/api/v1/mechanic/auth/invitations/";

    private static FixoraFactory NewFactory() => new();

    // Local 10:00 (UTC+5:30) on a non-Sunday, well in the future so no seeded booking collides.
    private static DateTime FutureWorkSlotUtc()
    {
        var day = DateTime.UtcNow.Date.AddDays(60);
        while (day.DayOfWeek == DayOfWeek.Sunday)
            day = day.AddDays(1);
        return DateTime.SpecifyKind(day.AddHours(10).AddMinutes(-330), DateTimeKind.Utc);
    }

    [Fact]
    public async Task Booking_uses_serviceId_and_slotStart_not_proposed_workshopId_and_preferredSlotId()
    {
        await using var factory = NewFactory();
        var kavitha = await factory.Customer();

        // Current contract: vehicleId, serviceId, slotStart (BookingRequest in WorkshopDtos.cs).
        var current = new BookingRequest(
            DemoIds.VehicleWagonR, DemoIds.ServiceBrake, FutureWorkSlotUtc(), "contract characterization", null, null);
        var accepted = new HttpRequestMessage(HttpMethod.Post, BookingsUrl) { Content = JsonContent.Create(current) };
        accepted.Headers.TryAddWithoutValidation("Idempotency-Key", $"d13-contract-ok-{Guid.NewGuid():N}");
        var ok = await kavitha.SendAsync(accepted);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        // Proposed field names (workshopId, preferredSlotId, complaint) do not bind to the current request.
        var proposed = new HttpRequestMessage(HttpMethod.Post, BookingsUrl)
        {
            Content = JsonContent.Create(new
            {
                vehicleId = DemoIds.VehicleWagonR,
                workshopId = Guid.NewGuid(),
                preferredSlotId = Guid.NewGuid(),
                complaint = "proposed-field body",
            })
        };
        proposed.Headers.TryAddWithoutValidation("Idempotency-Key", $"d13-contract-proposed-{Guid.NewGuid():N}");
        var rejected = await kavitha.SendAsync(proposed);
        // Observed: empty serviceId binds to no service, so the request is NotFound (not 200).
        Assert.Equal(HttpStatusCode.NotFound, rejected.StatusCode);
    }

    [Fact]
    public async Task Invitation_check_is_anonymous_so_unknown_token_is_not_401_or_403()
    {
        // Current controller marks invitation check/accept AllowAnonymous; proposal says signed-in acceptance.
        // Characterize today's behaviour: no auth challenge on the check endpoint.
        await using var factory = NewFactory();
        var anon = factory.CreateClient();

        var check = await anon.GetAsync(InvitationCheckUrl + "unknown-token-d13");
        // Observed: anonymous request reaches the service and an unknown token returns Gone (410).
        Assert.Equal(HttpStatusCode.Gone, check.StatusCode);
    }
}
