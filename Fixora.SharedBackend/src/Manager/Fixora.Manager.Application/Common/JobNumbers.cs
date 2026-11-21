using Fixora.Manager.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Manager.Application.Common;

public static class JobNumbers
{
    public static async Task<string> NextJobNumberAsync(IManagerDb db, DateTime now, CancellationToken ct)
        => $"JC-{now:yyyy}-{await db.JobCards.CountAsync(ct) + 1:0000}";

    public static JobCard NewJob(Appointment a, string number, int estimatedMinutes, int queueOrder, DateTime now) => new()
    {
        Number = number,
        AppointmentId = a.Id,
        CustomerId = a.CustomerId,
        CustomerName = a.CustomerName,
        VehicleId = a.VehicleId,
        VehicleLabel = a.VehicleLabel,
        MechanicId = a.MechanicId,
        BayId = a.BayId,
        Complaint = a.Notes ?? a.ServiceName,
        EstimatedMinutes = estimatedMinutes,
        Priority = a.Source == BookingSource.Sos ? 2 : 0,
        QueueOrder = queueOrder,
        CreatedAt = now,
    };
}
