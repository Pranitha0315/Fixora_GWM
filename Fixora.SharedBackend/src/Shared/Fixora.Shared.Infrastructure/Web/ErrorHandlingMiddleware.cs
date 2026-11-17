using System.Text.Json;
using Fixora.Shared.Contracts;
using Fixora.SharedKernel;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Fixora.Shared.Infrastructure.Web;

/// <summary>Adds X-Correlation-Id to every request/response and log scope (NFR-07, NFR-15).</summary>
public sealed class CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
{
    public const string Header = "X-Correlation-Id";

    public async Task InvokeAsync(HttpContext ctx)
    {
        var id = ctx.Request.Headers.TryGetValue(Header, out var v) && !string.IsNullOrWhiteSpace(v)
            ? v.ToString()
            : Guid.NewGuid().ToString("N");
        ctx.TraceIdentifier = id;
        ctx.Response.Headers[Header] = id;
        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
            await next(ctx);
    }
}

/// <summary>Maps exceptions to the shared ApiErrorResponse contract. Never leaks stack traces or PII.</summary>
public sealed class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (AppException ex)
        {
            await Write(ctx, ex.Status, ex.Code, ex.Message, ex.Errors);
        }
        catch (DbUpdateConcurrencyException)
        {
            await Write(ctx, 409, "concurrency_conflict", "This record was changed by someone else. Refresh and try again.", null);
        }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            // client went away
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error");
            await Write(ctx, 500, "server_error", "Something went wrong. Please try again.", null);
        }
    }

    private static async Task Write(HttpContext ctx, int status, string code, string message, IDictionary<string, string[]>? errors)
    {
        if (ctx.Response.HasStarted) return;
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json";
        var body = new ApiErrorResponse(status, code, message, ctx.TraceIdentifier, errors);
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(body, Json));
    }
}
