using Fixora.Customer.Application.Common;
using Fixora.Customer.Domain;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;

namespace Fixora.Customer.Application.Vehicles;

public sealed record VehicleDto(Guid Id, string RegistrationNo, string Make, string Model, int Year, string Type, int MileageKm, string? Color, string? Fuel, bool DriveSenseOptIn);
public sealed record VehicleUpsert(string RegistrationNo, string Make, string Model, int Year, string Type, int MileageKm, string? Color, string? Fuel);

public sealed class VehicleService(ICustomerDb db, IClock clock)
{
    public async Task<IReadOnlyList<VehicleDto>> ListAsync(Guid customerId, CancellationToken ct = default)
        => (await db.Vehicles.AsNoTracking().Where(v => v.CustomerId == customerId && v.Active).OrderBy(v => v.CreatedAt).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<Vehicle> GetOwnedAsync(Guid customerId, Guid vehicleId, CancellationToken ct = default)
        => await db.Vehicles.FirstOrDefaultAsync(v => v.Id == vehicleId && v.CustomerId == customerId && v.Active, ct)
           ?? throw new NotFoundException("Vehicle"); // 404, not 403: never confirm someone else's vehicle exists (NFR-02)

    public async Task<VehicleDto> AddAsync(Guid customerId, VehicleUpsert req, CancellationToken ct = default)
    {
        Validate(req);
        var reg = req.RegistrationNo.Trim().ToUpperInvariant();
        if (await db.Vehicles.AnyAsync(v => v.CustomerId == customerId && v.RegistrationNo == reg && v.Active, ct))
            throw new ConflictException("vehicle_exists", "You already added this vehicle.");
        var v = new Vehicle { CustomerId = customerId, CreatedAt = clock.UtcNow };
        Apply(v, req);
        db.Vehicles.Add(v);
        await db.SaveChangesAsync(ct);
        return ToDto(v);
    }

    public async Task<VehicleDto> UpdateAsync(Guid customerId, Guid vehicleId, VehicleUpsert req, CancellationToken ct = default)
    {
        Validate(req);
        var v = await GetOwnedAsync(customerId, vehicleId, ct);
        Apply(v, req);
        await db.SaveChangesAsync(ct);
        return ToDto(v);
    }

    public async Task RemoveAsync(Guid customerId, Guid vehicleId, CancellationToken ct = default)
    {
        var v = await GetOwnedAsync(customerId, vehicleId, ct);
        v.Active = false;
        v.DriveSenseOptIn = false;
        await db.SaveChangesAsync(ct);
    }

    private static void Validate(VehicleUpsert req)
    {
        Guard.Against(string.IsNullOrWhiteSpace(req.RegistrationNo) || string.IsNullOrWhiteSpace(req.Make) || string.IsNullOrWhiteSpace(req.Model), "Registration, make and model are required.");
        Guard.Against(req.Year is < 1970 or > 2030, "Year looks wrong.");
    }

    private static void Apply(Vehicle v, VehicleUpsert req)
    {
        v.RegistrationNo = req.RegistrationNo.Trim().ToUpperInvariant();
        v.Make = req.Make.Trim();
        v.Model = req.Model.Trim();
        v.Year = req.Year;
        v.Type = Enum.TryParse<VehicleType>(req.Type, true, out var t) ? t : VehicleType.Car;
        v.MileageKm = Math.Max(0, req.MileageKm);
        v.Color = req.Color;
        v.Fuel = req.Fuel;
    }

    public static VehicleDto ToDto(Vehicle v) => new(v.Id, v.RegistrationNo, v.Make, v.Model, v.Year, v.Type.ToString(), v.MileageKm, v.Color, v.Fuel, v.DriveSenseOptIn);
}
