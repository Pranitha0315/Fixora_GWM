using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Fixora.Shared.Contracts;
using Fixora.Shared.Infrastructure.Seeding;

namespace Fixora.Tests.Integration;

/// <summary>
/// Serializes this suite: FixoraFactory configures InMemory via process-wide env vars,
/// so parallel hosts can collide on Database__InMemoryName during seed.
/// </summary>
[CollectionDefinition("fixora-hub-joinjob", DisableParallelization = true)]
public sealed class FixoraHubJoinJobRealtimeCollection;

/// <summary>
/// FX13-D05-NID-2: real FixoraHub JoinJob authorization over SignalR (TestServer WebSocket).
/// Asserts hub invocation allow/deny only — does not claim queue.updated ETA delivery coverage.
/// Uses the SignalR JSON protocol directly because SignalR.Client is not referenced by the test project.
/// </summary>
[Collection("fixora-hub-joinjob")]
public sealed class FixoraHubJoinJobRealtimeTests : IAsyncLifetime
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

    private Task<string> RaviTokenAsync()
        => AccessTokenAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-001", pin = "1234" });

    private Task<string> KumarTokenAsync()
        => AccessTokenAsync(
            "/api/v1/mechanic/auth/pin-login",
            new { login = "EMP-002", pin = "2345" });

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
        var handshake = await ReceiveJsonAsync(socket, TimeSpan.FromSeconds(5));
        Assert.True(
            handshake.ValueKind == JsonValueKind.Object && handshake.EnumerateObject().MoveNext() == false,
            "SignalR handshake response must be an empty JSON object.");
        return socket;
    }

    private static async Task SendAsync(WebSocket socket, string jsonWithoutSeparator)
    {
        var bytes = Encoding.UTF8.GetBytes(jsonWithoutSeparator + RecordSeparator);
        await socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, CancellationToken.None);
    }

    private static async Task<JsonElement> ReceiveJsonAsync(WebSocket socket, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        var buffer = new byte[16 * 1024];
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

    private static async Task<bool> InvokeJoinJobAsync(WebSocket socket, Guid jobId)
    {
        var invocationId = Guid.NewGuid().ToString("N");
        var request = JsonSerializer.Serialize(new
        {
            type = 1,
            invocationId,
            target = "JoinJob",
            arguments = new object[] { jobId }
        });
        await SendAsync(socket, request);

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            var remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero)
            {
                break;
            }

            var frame = await ReceiveJsonAsync(socket, remaining);
            if (!frame.TryGetProperty("type", out var type) || type.GetInt32() != 3)
            {
                continue;
            }

            if (!frame.TryGetProperty("invocationId", out var id) ||
                !string.Equals(id.GetString(), invocationId, StringComparison.Ordinal))
            {
                continue;
            }

            if (frame.TryGetProperty("error", out var error))
            {
                throw new InvalidOperationException($"JoinJob hub error: {error.GetString()}");
            }

            Assert.True(frame.TryGetProperty("result", out var result));
            Assert.True(
                result.ValueKind is JsonValueKind.True or JsonValueKind.False,
                "JoinJob must complete with a boolean result.");
            return result.GetBoolean();
        }

        throw new TimeoutException("Timed out waiting for JoinJob completion.");
    }

    private static async Task InvokeLeaveJobAsync(WebSocket socket, Guid jobId)
    {
        var invocationId = Guid.NewGuid().ToString("N");
        var request = JsonSerializer.Serialize(new
        {
            type = 1,
            invocationId,
            target = "LeaveJob",
            arguments = new object[] { jobId }
        });
        await SendAsync(socket, request);

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            var remaining = deadline - DateTime.UtcNow;
            if (remaining <= TimeSpan.Zero)
            {
                break;
            }

            var frame = await ReceiveJsonAsync(socket, remaining);
            if (!frame.TryGetProperty("type", out var type) || type.GetInt32() != 3)
            {
                continue;
            }

            if (!frame.TryGetProperty("invocationId", out var id) ||
                !string.Equals(id.GetString(), invocationId, StringComparison.Ordinal))
            {
                continue;
            }

            if (frame.TryGetProperty("error", out var error))
            {
                throw new InvalidOperationException($"LeaveJob hub error: {error.GetString()}");
            }

            return;
        }

        throw new TimeoutException("Timed out waiting for LeaveJob completion.");
    }

    private static async Task DisposeSocketAsync(WebSocket socket)
    {
        try
        {
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);
            }
        }
        catch (WebSocketException)
        {
            // Connection may already be torn down by the test host.
        }
        finally
        {
            socket.Dispose();
        }
    }

    [Fact]
    public async Task Owning_customer_JoinJob_returns_true()
    {
        var token = await KavithaTokenAsync();
        var socket = await ConnectHubAsync(token);
        try
        {
            var allowed = await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday);
            Assert.True(allowed);
        }
        finally
        {
            await DisposeSocketAsync(socket);
        }
    }

    [Fact]
    public async Task Other_customer_JoinJob_returns_false()
    {
        var token = await ArunTokenAsync();
        var socket = await ConnectHubAsync(token);
        try
        {
            var allowed = await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday);
            Assert.False(allowed);
        }
        finally
        {
            await DisposeSocketAsync(socket);
        }
    }

    [Fact]
    public async Task Assigned_mechanic_JoinJob_returns_true()
    {
        var token = await RaviTokenAsync();
        var socket = await ConnectHubAsync(token);
        try
        {
            var allowed = await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday);
            Assert.True(allowed);
        }
        finally
        {
            await DisposeSocketAsync(socket);
        }
    }

    [Fact]
    public async Task Unassigned_mechanic_JoinJob_returns_false()
    {
        var token = await KumarTokenAsync();
        var socket = await ConnectHubAsync(token);
        try
        {
            var allowed = await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday);
            Assert.False(allowed);
        }
        finally
        {
            await DisposeSocketAsync(socket);
        }
    }

    [Fact]
    public async Task Owner_can_LeaveJob_then_rejoin()
    {
        var token = await KavithaTokenAsync();
        var socket = await ConnectHubAsync(token);
        try
        {
            Assert.True(await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday));
            await InvokeLeaveJobAsync(socket, DemoIds.JobKavithaToday);
            Assert.True(await InvokeJoinJobAsync(socket, DemoIds.JobKavithaToday));
        }
        finally
        {
            await DisposeSocketAsync(socket);
        }
    }
}
