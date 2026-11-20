using Fixora.SharedKernel;

namespace Fixora.Manager.Domain;

public enum AppointmentStatus { Requested, Confirmed, Declined, Cancelled, CheckedIn, Completed, NoShow }

public enum BookingSource { App, WalkIn, DriveSense, Sos, Promo }

public sealed class Appointment : Entity
{
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public Guid VehicleId { get; set; }
    public string VehicleLabel { get; set; } = "";
    public Guid ServiceId { get; set; }
    public string ServiceName { get; set; } = "";
    public DateTime SlotStart { get; set; }
    public DateTime SlotEnd { get; set; }
    public AppointmentStatus Status { get; set; } = AppointmentStatus.Requested;
    public BookingSource Source { get; set; } = BookingSource.App;
    public Guid? BayId { get; set; }
    public Guid? MechanicId { get; set; }
    public string? Notes { get; set; }
    public string? PromoCode { get; set; }
    public Guid? SuggestionId { get; set; }
    public string? IdempotencyKey { get; set; }
    public string? DeclineReason { get; set; }
    public Guid? JobCardId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAt { get; set; }

    public bool OccupiesCapacity => Status is AppointmentStatus.Requested or AppointmentStatus.Confirmed or AppointmentStatus.CheckedIn;

    public void Confirm(Guid bayId, Guid mechanicId, DateTime now)
    {
        if (Status != AppointmentStatus.Requested)
            throw new ConflictException("booking_not_requested", "Only a requested booking can be confirmed.");
        Status = AppointmentStatus.Confirmed;
        BayId = bayId;
        MechanicId = mechanicId;
        DecidedAt = now;
    }

    public void Decline(string reason, DateTime now)
    {
        if (Status != AppointmentStatus.Requested)
            throw new ConflictException("booking_not_requested", "Only a requested booking can be declined.");
        Status = AppointmentStatus.Declined;
        DeclineReason = reason;
        DecidedAt = now;
    }

    public void Cancel(DateTime now, int cutoffHours, bool byStaff)
    {
        if (Status is not (AppointmentStatus.Requested or AppointmentStatus.Confirmed))
            throw new ConflictException("booking_not_cancellable", "This booking can no longer be cancelled.");
        if (!byStaff && SlotStart - now < TimeSpan.FromHours(cutoffHours))
            throw new ConflictException("cancel_cutoff", $"Bookings can be cancelled up to {cutoffHours} hours before the slot. Please call the garage.");
        Status = AppointmentStatus.Cancelled;
        DecidedAt = now;
    }
}
