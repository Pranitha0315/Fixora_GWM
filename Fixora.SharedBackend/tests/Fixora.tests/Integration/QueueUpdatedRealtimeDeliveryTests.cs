using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Fixora.Manager.Application.Jobs;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;
using Microsoft.Extensions.DependencyInjection;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("queue-updated-delivery", DisableParallelization = true)]
public sealed class QueueUpdatedRealtimeDeliveryCollection;

/// <summary>
/// FX13-D05-NID-2: live queue.updated ETA delivery privacy over FixoraHub.
/// Connects real JWT WebSocket clients, triggers QueueService.RecalculateAsync, and asserts
/// which customers receive which payloads. Does not modify production routing.
/// </summary>
[Collection("queue-updated-delivery")]
public sealed class QueueUpdatedRealtimeDeliveryTests : IAsyncLifetime
{
    private const char RecordSeparator = '\u001e';

    private readonly FixoraFactory _factory = new();

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task<string> AccessTokenAsync(string path, object body)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(path, body);
        response.EnsureSuccessStatusCode();
        var tokens = await response.Content.ReadFromJsonAsync<AuthTokens>();
        Assert.False(string.IsNullOrWhiteSpace(tokens?.AccessToken));
        return tokens!.AccessToken;
    }

    private Task<string> KavithaTokenAsync()
        => AccessTokenAsync(
            "/api/v1/customer/auth/login",
            new { email = "kavitha@fixora.lk", password = "Fixora@123" });

    private Task<string> ArunTokenAsync()
        => AccessTokenAsync(
            "/api/v1/customer/auth/login",
            new { email = "arun@fixora.lk", password = "Fixora@123" });

    private Task<string> ManagerTokenAsync()
        => AccessTokenAsync(
            "/api/v1/manager/auth/login",
            new { email = "manager@fixora.lk", password = "Fixora@123" });

    private async Task<string> NegotiateAsync(string accessToken)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var response = await client.PostAsync("/hubs/fixora/negotiate?negotiateVersion=1", content: null);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;
        var token = root.TryGetProperty("connectionToken", out var connectionToken)
            ? connectionToken.GetString()
            : root.GetProperty("connectionId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        return token!;
    }

    private async Task<WebSocket> ConnectHubAsync(string accessToken)
    {
        var connectionToken = await NegotiateAsync(accessToken);
        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(
            _factory.Server.BaseAddress!,
            $"/hubs/fixora?id={Uri.EscapeDataString(connectionToken)}&access_token={Uri.EscapeDataString(accessToken)}");
        var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);

        await SendAsync(socket, """{"protocol":"json","version":1}""");
        var handshake = await ReceiveNextJsonAsync(socket, TimeSpan.FromSeconds(5));
        Assert.True(
            handshake.ValueKind == JsonValueKind.Object && !handshake.EnumerateObject().Any(),
            "SignalR handshake response must be an empty JSON object.");
        return socket;
    }

    private static async Task SendAsync(WebSocket socket, string jsonWithoutSeparator)
    {
        var bytes = Encoding.UTF8.GetBytes(jsonWithoutSeparator + RecordSeparator);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, CancellationToken.None);
    }

    private static async Task<JsonElement> ReceiveNextJsonAsync(WebSocket socket, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        var buffer = new byte[32 * 1024];
        var text = new StringBuilder();

        while (!cts.IsCancellationRequested)
        {
            var result = await socket.ReceiveAsync(buffer, cts.Token);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                throw new InvalidOperationException("Hub closed the WebSocket before a SignalR frame arrived.");
            }

            text.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            if (!result.EndOfMessage)
            {
                continue;
            }

            var payload = text.ToString();
            text.Clear();
            foreach (var frame in payload.Split(RecordSeparator, StringSplitOptions.RemoveEmptyEntries))
            {
                using var doc = JsonDocument.Parse(frame);
                var root = doc.RootElement.Clone();
                if (root.TryGetProperty("type", out var type) && type.GetInt32() == 6)
                {
                    await SendAsync(socket, """{"type":6}""");
                    continue;
                }

                return root;
            }
        }

        throw new TimeoutException("Timed out waiting for a SignalR JSON frame.");
    }

    private sealed class HubEventCollector : IAsyncDisposable
    {
        private readonly WebSocket _socket;
        private readonly CancellationTokenSource _cts = new();
        private readonly ConcurrentBag<(string Target, JsonElement Argument)> _events = new();
        private readonly Task _loop;

        public HubEventCollector(WebSocket socket)
        {
            _socket = socket;
            _loop = Task.Run(ReadLoopAsync);
        }

        public IReadOnlyCollection<(string Target, JsonElement Argument)> Snapshot()
            => _events.ToArray();

        private async Task ReadLoopAsync()
        {
            var buffer = new byte[32 * 1024];
            var text = new StringBuilder();
            try
            {
                while (!_cts.IsCancellationRequested &&
                       _socket.State == WebSocketState.Open)
                {
                    var result = await _socket.ReceiveAsync(buffer, _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        return;
                    }

                    text.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    if (!result.EndOfMessage)
                    {
                        continue;
                    }

                    var payload = text.ToString();
                    text.Clear();
                    foreach (var frame in payload.Split(RecordSeparator, StringSplitOptions.RemoveEmptyEntries))
                    {
                        using var doc = JsonDocument.Parse(frame);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("type", out var typeElem))
                        {
                            var type = typeElem.GetInt32();
                            if (type == 6)
                            {
                                await SendAsync(_socket, """{"type":6}""");
                                continue;
                            }

                            if (type == 1 &&
                                root.TryGetProperty("target", out var target) &&
                                root.TryGetProperty("arguments", out var args) &&
                                args.ValueKind == JsonValueKind.Array &&
                                args.GetArrayLength() > 0)
                            {
                                _events.Add((target.GetString() ?? "", args[0].Clone()));
                            }
                        }
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Expected on dispose.
            }
            catch (WebSocketException)
            {
                // Connection closed during teardown.
            }
        }

        public async ValueTask DisposeAsync()
        {
            _cts.Cancel();
            try
            {
                await _loop.WaitAsync(TimeSpan.FromSeconds(2));
            }
            catch
            {
                // Best-effort drain stop.
            }

            try
            {
                if (_socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);
                }
            }
            catch (WebSocketException)
            {
            }
            finally
            {
                _socket.Dispose();
                _cts.Dispose();
            }
        }
    }

    private static bool IsQueueUpdatedForJob(JsonElement argument, Guid jobId)
    {
        if (argument.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (!TryGetJobId(argument, out var id))
        {
            return false;
        }

        return id == jobId;
    }

    private static bool TryGetJobId(JsonElement obj, out Guid jobId)
    {
        jobId = default;
        if (obj.TryGetProperty("jobId", out var prop) || obj.TryGetProperty("JobId", out prop))
        {
            if (prop.ValueKind == JsonValueKind.String && Guid.TryParse(prop.GetString(), out jobId))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsBoardPayload(JsonElement argument)
        => argument.ValueKind == JsonValueKind.Array;

    private static async Task WaitForAsync(
        HubEventCollector collector,
        Func<(string Target, JsonElement Argument), bool> predicate,
        TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (collector.Snapshot().Any(predicate))
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException("Timed out waiting for the expected hub event.");
    }

    private async Task RecalculateQueueAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var queue = scope.ServiceProvider.GetRequiredService<QueueService>();
        await queue.RecalculateAsync();
    }

    [Fact]
    public async Task Owning_customer_receives_own_queue_updated_eta()
    {
        var kavitha = await ConnectHubAsync(await KavithaTokenAsync());
        await using var listener = new HubEventCollector(kavitha);

        await RecalculateQueueAsync();

        await WaitForAsync(
            listener,
            e => e.Target == RealtimeEvents.QueueUpdated &&
                 IsQueueUpdatedForJob(e.Argument, DemoIds.JobKavithaToday),
            TimeSpan.FromSeconds(5));

        var matches = listener.Snapshot()
            .Where(e => e.Target == RealtimeEvents.QueueUpdated &&
                        IsQueueUpdatedForJob(e.Argument, DemoIds.JobKavithaToday))
            .ToList();
        Assert.NotEmpty(matches);
        Assert.All(matches, e => Assert.False(IsBoardPayload(e.Argument)));
    }

    [Fact]
    public async Task Other_customer_does_not_receive_foreign_job_eta()
    {
        var kavithaSocket = await ConnectHubAsync(await KavithaTokenAsync());
        var arunSocket = await ConnectHubAsync(await ArunTokenAsync());
        await using var kavitha = new HubEventCollector(kavithaSocket);
        await using var arun = new HubEventCollector(arunSocket);

        await RecalculateQueueAsync();

        await WaitForAsync(
            kavitha,
            e => e.Target == RealtimeEvents.QueueUpdated &&
                 IsQueueUpdatedForJob(e.Argument, DemoIds.JobKavithaToday),
            TimeSpan.FromSeconds(5));

        // Prove Arun's connection is live by waiting for his own ETA before privacy asserts.
        await WaitForAsync(
            arun,
            e => e.Target == RealtimeEvents.QueueUpdated &&
                 IsQueueUpdatedForJob(e.Argument, DemoIds.JobArunToday),
            TimeSpan.FromSeconds(5));

        Assert.DoesNotContain(
            arun.Snapshot(),
            e => e.Target == RealtimeEvents.QueueUpdated &&
                 IsQueueUpdatedForJob(e.Argument, DemoIds.JobKavithaToday));

        Assert.DoesNotContain(
            arun.Snapshot().Where(e => e.Target == RealtimeEvents.QueueUpdated),
            e => IsBoardPayload(e.Argument));
    }

    [Fact]
    public async Task Manager_receives_queue_board_update()
    {
        var managerSocket = await ConnectHubAsync(await ManagerTokenAsync());
        await using var manager = new HubEventCollector(managerSocket);

        await RecalculateQueueAsync();

        await WaitForAsync(
            manager,
            e => e.Target == RealtimeEvents.QueueUpdated && IsBoardPayload(e.Argument),
            TimeSpan.FromSeconds(5));

        var board = manager.Snapshot()
            .Where(e => e.Target == RealtimeEvents.QueueUpdated && IsBoardPayload(e.Argument))
            .Select(e => e.Argument)
            .First();

        Assert.True(board.GetArrayLength() >= 1);
        var jobIds = board.EnumerateArray()
            .Select(item =>
            {
                Assert.True(TryGetSummaryId(item, out var id), "Board items are JobSummaryDto and expose id.");
                return id;
            })
            .ToHashSet();
        Assert.Contains(DemoIds.JobKavithaToday, jobIds);
    }

    private static bool TryGetSummaryId(JsonElement obj, out Guid id)
    {
        id = default;
        if (obj.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (obj.TryGetProperty("id", out var prop) || obj.TryGetProperty("Id", out prop))
        {
            if (prop.ValueKind == JsonValueKind.String && Guid.TryParse(prop.GetString(), out id))
            {
                return true;
            }
        }

        return false;
    }
}
