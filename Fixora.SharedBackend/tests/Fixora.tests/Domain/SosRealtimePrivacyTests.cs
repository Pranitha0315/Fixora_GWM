using Fixora.Customer.Application.Sos;
using Fixora.Customer.Contracts;
using Fixora.Customer.Domain;
using Fixora.Customer.Infrastructure.Persistence;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Tests.Domain;

/// <summary>
/// FX13-D10-NID-2: sos.updated SignalR split — closed SOS redacts lat/lng for mechanic group only.
/// </summary>
public sealed class SosRealtimePrivacyTests
{
    private const double Lat = 9.6615;
    private const double Lng = 80.0255;

    private sealed class TestClock : IClock
    {
        public DateTime UtcNow { get; set; } = new(2026, 11, 25, 10, 0, 0, DateTimeKind.Utc);
    }

    private sealed class CapturingNotifier : INotificationService
    {
        public List<(string EventName, object Payload, IReadOnlyList<string> Groups)> Publishes { get; } = new();

        public Task NotifyAsync(NotificationMessage message, IEnumerable<Recipient> recipients, CancellationToken ct = default)
            => Task.CompletedTask;

        public Task PublishAsync(string eventName, object payload, IEnumerable<string> groups, CancellationToken ct = default)
        {
            Publishes.Add((eventName, payload, groups.ToList()));
            return Task.CompletedTask;
        }
    }

    private static CustomerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<CustomerDbContext>()
            .UseInMemoryDatabase($"sos-rt-privacy-{Guid.NewGuid():N}")
            .Options;
        return new CustomerDbContext(options);
    }

    private static async Task<(SosService Sos, CapturingNotifier Notifier, Guid CustomerId, Guid MechanicId, Guid SosId)> SeedDispatchedAsync()
    {
        var db = CreateDb();
        var clock = new TestClock();
        var notifier = new CapturingNotifier();
        var sos = new SosService(db, notifier, clock);

        var customerId = Guid.NewGuid();
        var mechanicId = Guid.NewGuid();
        var staffId = Guid.NewGuid();

        db.Customers.Add(new CustomerAccount
        {
            Id = customerId,
            Email = $"{customerId:N}@test.local",
            Name = "Privacy Cust",
            Phone = "0770000000",
            PreferredLanguage = "en",
            PasswordHash = "x"
        });
        await db.SaveChangesAsync();

        var receipt = await sos.CreateAsync(
            customerId,
            new CreateSosRequest(Lat, Lng, "FlatTyre", null, "rt-privacy", true),
            $"idem-{Guid.NewGuid():N}",
            "0110000000");
        await sos.DispatchAsync(receipt.ReceiptId, staffId, mechanicId, "go");
        notifier.Publishes.Clear();

        return (sos, notifier, customerId, mechanicId, receipt.ReceiptId);
    }

    [Fact]
    public async Task Open_dispatched_sos_updated_keeps_coords_for_mechanic_group()
    {
        var (sos, notifier, customerId, mechanicId, sosId) = await SeedDispatchedAsync();
        await sos.UpdateStatusAsync(sosId, Roles.Mechanic, mechanicId, "OnSite", "arrived");

        var publishes = notifier.Publishes.Where(p => p.EventName == RealtimeEvents.SosUpdated).ToList();
        Assert.Equal(2, publishes.Count);

        var staffCustomer = Assert.Single(publishes, p =>
            p.Groups.Contains(RealtimeGroups.Staff) &&
            p.Groups.Contains(RealtimeGroups.User(customerId)));
        var staffDto = Assert.IsType<SosDto>(staffCustomer.Payload);
        Assert.Equal(Lat, staffDto.Lat);
        Assert.Equal(Lng, staffDto.Lng);

        var mechanic = Assert.Single(publishes, p => p.Groups.Contains(RealtimeGroups.User(mechanicId)));
        var mechDto = Assert.IsType<SosDto>(mechanic.Payload);
        Assert.Equal("OnSite", mechDto.Status);
        Assert.Equal(Lat, mechDto.Lat);
        Assert.Equal(Lng, mechDto.Lng);
    }

    [Fact]
    public async Task Resolved_sos_updated_redacts_lat_lng_for_mechanic_keeps_staff_customer()
    {
        var (sos, notifier, customerId, mechanicId, sosId) = await SeedDispatchedAsync();
        await sos.UpdateStatusAsync(sosId, Roles.Mechanic, mechanicId, "Resolved", "done");

        var publishes = notifier.Publishes.Where(p => p.EventName == RealtimeEvents.SosUpdated).ToList();
        Assert.Equal(2, publishes.Count);

        var staffCustomer = Assert.Single(publishes, p =>
            p.Groups.Contains(RealtimeGroups.Staff) &&
            p.Groups.Contains(RealtimeGroups.User(customerId)));
        var staffDto = Assert.IsType<SosDto>(staffCustomer.Payload);
        Assert.Equal("Resolved", staffDto.Status);
        Assert.Equal(Lat, staffDto.Lat);
        Assert.Equal(Lng, staffDto.Lng);

        var mechanic = Assert.Single(publishes, p => p.Groups.Contains(RealtimeGroups.User(mechanicId)));
        var mechDto = Assert.IsType<SosDto>(mechanic.Payload);
        Assert.Equal("Resolved", mechDto.Status);
        Assert.Null(mechDto.Lat);
        Assert.Null(mechDto.Lng);
    }

    [Fact]
    public async Task Cancelled_sos_updated_redacts_lat_lng_for_mechanic_keeps_staff_customer()
    {
        var (sos, notifier, customerId, mechanicId, sosId) = await SeedDispatchedAsync();
        await sos.UpdateStatusAsync(sosId, Roles.Mechanic, mechanicId, "Cancelled", "could not reach");

        var publishes = notifier.Publishes.Where(p => p.EventName == RealtimeEvents.SosUpdated).ToList();
        Assert.Equal(2, publishes.Count);

        var staffCustomer = Assert.Single(publishes, p =>
            p.Groups.Contains(RealtimeGroups.Staff) &&
            p.Groups.Contains(RealtimeGroups.User(customerId)));
        var staffDto = Assert.IsType<SosDto>(staffCustomer.Payload);
        Assert.Equal("Cancelled", staffDto.Status);
        Assert.Equal(Lat, staffDto.Lat);
        Assert.Equal(Lng, staffDto.Lng);

        var mechanic = Assert.Single(publishes, p => p.Groups.Contains(RealtimeGroups.User(mechanicId)));
        var mechDto = Assert.IsType<SosDto>(mechanic.Payload);
        Assert.Equal("Cancelled", mechDto.Status);
        Assert.Null(mechDto.Lat);
        Assert.Null(mechDto.Lng);
    }

    [Fact]
    public void ForMechanicRealtime_only_nulls_closed_statuses()
    {
        var open = new SosDto(
            Guid.NewGuid(), Guid.NewGuid(), "A", "1", null, null, Lat, Lng, "FlatTyre", null,
            "Dispatched", DateTime.UtcNow, Guid.NewGuid(), null, Array.Empty<SosHistoryDto>());
        Assert.Same(open, SosService.ForMechanicRealtime(open));

        var closed = open with { Status = "Resolved" };
        var redacted = SosService.ForMechanicRealtime(closed);
        Assert.Null(redacted.Lat);
        Assert.Null(redacted.Lng);
        Assert.Equal("Resolved", redacted.Status);
    }
}
