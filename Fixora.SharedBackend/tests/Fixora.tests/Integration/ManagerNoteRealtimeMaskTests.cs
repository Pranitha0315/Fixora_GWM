using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Fixora.Manager.Application.Common;
using Fixora.Manager.Application.Jobs;
using Fixora.Manager.Contracts;
using Fixora.Manager.Domain;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Fixora.Tests.Integration;

/// <summary>
/// ManagerNote over SignalR (tests only — no production change).
/// A job update publishes the full job to staff + the assigned mechanic, and a masked copy to the job group
/// and the customer. This test captures every <see cref="INotificationService.PublishAsync"/> call and asserts the
/// note reaches only the internal audience. Positive control: the staff event really carries the note.
/// </summary>
[Collection("api")]
public class ManagerNoteRealtimeMaskTests : IDisposable
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private const string Sentinel = "MGR-NOTE-REALTIME-SENTINEL-19c4";

    private readonly CapturingFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private async Task<HttpClient> ManagerClientAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var tokens = await scope.ServiceProvider.GetRequiredService<ITokenService>().IssueAsync(DemoIds.Manager, Roles.Manager, "Manager");
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return client;
    }

    private async Task SetJobManagerNoteAsync(string? note)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IManagerDb>();
        db.JobCards.Single(j => j.Id == DemoIds.JobKavithaToday).ManagerNote = note;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Job_update_gives_the_note_to_staff_and_mechanic_but_never_to_the_customer_or_job_group()
    {
        await SetJobManagerNoteAsync(Sentinel);
        var manager = await ManagerClientAsync();

        // Re-assign to the same mechanic and bay: no assignment notification, but PublishJobAsync still runs.
        var res = await manager.PostAsJsonAsync(
            $"/api/v1/manager/jobs/{DemoIds.JobKavithaToday}/assign",
            new AssignJobRequest(DemoIds.MechanicRavi, DemoIds.Bay1));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var jobEvents = _factory.Notifier.Events.Where(e => e.Event == RealtimeEvents.JobUpdated).ToList();
        Assert.NotEmpty(jobEvents);

        // Positive control: the internal (staff) audience receives the note.
        var internalEvent = Assert.Single(jobEvents, e => e.Groups.Contains(RealtimeGroups.Staff));
        var internalPayload = Assert.IsType<JobSummaryDto>(internalEvent.Payload);
        Assert.Equal(Sentinel, internalPayload.ManagerNote);
        Assert.Contains(RealtimeGroups.User(DemoIds.MechanicRavi), internalEvent.Groups);

        // Customer and job group receive only masked copies.
        var externalEvents = jobEvents.Where(e => !e.Groups.Contains(RealtimeGroups.Staff)).ToList();
        Assert.NotEmpty(externalEvents);
        foreach (var e in externalEvents)
        {
            Assert.DoesNotContain(RealtimeGroups.Staff, e.Groups);
            var payload = Assert.IsType<JobSummaryDto>(e.Payload);
            Assert.Null(payload.ManagerNote);
            var json = JsonSerializer.Serialize(e.Payload, Web);
            Assert.DoesNotContain(Sentinel, json);
        }
        Assert.Contains(externalEvents, e => e.Groups.Contains(RealtimeGroups.User(DemoIds.CustomerKavitha)));
        Assert.Contains(externalEvents, e => e.Groups.Contains(RealtimeGroups.Job(DemoIds.JobKavithaToday)));
    }

    /// <summary>Captured realtime publish (event name, payload, target groups).</summary>
    public sealed record CapturedEvent(string Event, object Payload, IReadOnlyList<string> Groups);

    /// <summary>Records publishes instead of sending them over SignalR.</summary>
    public sealed class CapturingNotifier : INotificationService
    {
        private readonly List<CapturedEvent> _events = [];
        public IReadOnlyList<CapturedEvent> Events { get { lock (_events) return _events.ToList(); } }

        public Task NotifyAsync(NotificationMessage message, IEnumerable<Recipient> recipients, CancellationToken ct = default) => Task.CompletedTask;

        public Task PublishAsync(string eventName, object payload, IEnumerable<string> groups, CancellationToken ct = default)
        {
            lock (_events) _events.Add(new CapturedEvent(eventName, payload, groups.ToList()));
            return Task.CompletedTask;
        }
    }

    /// <summary>Own app instance (own in-memory DB) whose notifier is the capturing fake.</summary>
    public sealed class CapturingFactory : WebApplicationFactory<Program>
    {
        public CapturingNotifier Notifier { get; } = new();

        public CapturingFactory()
        {
            Environment.SetEnvironmentVariable("Database__Provider", "InMemory");
            Environment.SetEnvironmentVariable("Database__InMemoryName", $"fixora-tests-rt-mask-{Guid.NewGuid():N}");
            Environment.SetEnvironmentVariable("Workers__Enabled", "false");
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<INotificationService>();
                services.AddSingleton<INotificationService>(Notifier);
            });
        }
    }
}
