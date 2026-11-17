namespace Fixora.SharedKernel;

/// <summary>
/// Base for expected business errors. The API error middleware turns these into the
/// shared ApiErrorResponse contract (status, machine code, safe message, correlationId).
/// </summary>
public class AppException : Exception
{
    public AppException(int status, string code, string message, IDictionary<string, string[]>? errors = null)
        : base(message)
    {
        Status = status;
        Code = code;
        Errors = errors;
    }

    public int Status { get; }
    public string Code { get; }
    public IDictionary<string, string[]>? Errors { get; }
}

public sealed class NotFoundException(string what)
    : AppException(404, "not_found", $"{what} was not found.");

public sealed class ForbiddenException(string message = "You do not have access to this resource.")
    : AppException(403, "forbidden", message);

public sealed class ConflictException(string code, string message)
    : AppException(409, code, message);

public sealed class ValidationException(string message, IDictionary<string, string[]>? errors = null)
    : AppException(400, "validation_failed", message, errors);

public sealed class UnauthorizedAppException(string message = "Invalid credentials.")
    : AppException(401, "unauthorized", message);

public static class Guard
{
    public static void Against(bool condition, string message)
    {
        if (condition) throw new ValidationException(message);
    }

    public static T Found<T>(T? value, string what) where T : class
        => value ?? throw new NotFoundException(what);
}
