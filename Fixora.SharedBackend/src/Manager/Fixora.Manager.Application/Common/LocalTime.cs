namespace Fixora.Manager.Application.Common;

/// <summary>Formats UTC timestamps in the pilot branch's local time (Sri Lanka, UTC+5:30) for notification text.</summary>
public static class LocalTime
{
    public static int OffsetMinutes { get; set; } = 330;

    public static string Format(DateTime utc) => utc.AddMinutes(OffsetMinutes).ToString("ddd dd MMM, h:mm tt");

    public static string Clock(DateTime? utc) => utc is null ? "—" : utc.Value.AddMinutes(OffsetMinutes).ToString("h:mm tt");
}
