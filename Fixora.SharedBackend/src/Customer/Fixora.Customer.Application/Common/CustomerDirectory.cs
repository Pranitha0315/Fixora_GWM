using Fixora.Customer.Contracts;
using Fixora.Customer.Domain;
using Fixora.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fixora.Customer.Application.Common;

/// <summary>Read-only customer facts for the Manager and Mechanic contexts, plus loyalty ledger operations.</summary>
public sealed class CustomerDirectory(ICustomerDb db, IOptions<CustomerOptions> options, IClock clock) : ICustomerDirectory
{
    public async Task<CustomerSummary?> GetCustomerAsync(Guid customerId, CancellationToken ct = default)
        => await db.Customers.AsNoTracking().Where(c => c.Id == customerId)
            .Select(c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage)).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, CustomerSummary>> GetCustomersAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var list = ids.Distinct().ToList();
        return await db.Customers.AsNoTracking().Where(c => list.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage), ct);
    }

    public async Task<VehicleSummary?> GetVehicleAsync(Guid vehicleId, CancellationToken ct = default)
    {
        var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        return v is null ? null : new VehicleSummary(v.Id, v.CustomerId, v.RegistrationNo, v.Make, v.Model, v.Year, v.Type.ToString(), v.DriveSenseOptIn);
    }

    public async Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(CancellationToken ct = default)
        => await db.Customers.AsNoTracking().Where(c => c.EmailVerified).OrderBy(c => c.Name)
            .Select(c => new CustomerSummary(c.Id, c.Name, c.Email, c.Phone, c.PreferredLanguage)).ToListAsync(ct);
}
