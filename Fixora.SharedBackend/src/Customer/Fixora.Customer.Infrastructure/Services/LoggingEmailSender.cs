using Fixora.Customer.Application.Common;
using Microsoft.Extensions.Logging;

namespace Fixora.Customer.Infrastructure.Services;

/// <summary>Development email sender. Never logs the address (NFR-07); swap for SMTP / SendGrid.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        logger.LogInformation("Email queued: {Subject} (to ***@{Domain})", subject, to.Split('@').LastOrDefault());
        return Task.CompletedTask;
    }
}
