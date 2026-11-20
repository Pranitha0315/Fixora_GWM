using Fixora.SharedKernel;

namespace Fixora.Mechanic.Domain;

/// <summary>Mechanic identity for Fixora Rev: 4-digit PIN on a shared workshop phone (BR-SF-17).</summary>
public sealed class MechanicAccount : Entity
{
    public const int MaxFailedPins = 5;

    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string EmployeeCode { get; set; } = "";
    public string PinHash { get; set; } = "";
    public bool Active { get; set; } = true;
    public bool OnDuty { get; set; } = true;
    public string PreferredLanguage { get; set; } = "ta";
    public int FailedPinAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
    public Guid? InvitationId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public void RegisterFailedPin(DateTime now)
    {
        FailedPinAttempts++;
        if (FailedPinAttempts >= MaxFailedPins)
        {
            LockedUntil = now.AddMinutes(15);
            FailedPinAttempts = 0;
        }
    }
}
