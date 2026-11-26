using Fixora.Mechanic.Contracts;

namespace Fixora.Tests.Support;

/// <summary>Simple in-test mechanic lookup for InvitationService construction.</summary>
internal sealed class TestMechanicDirectory(params Guid[] activeIds) : IMechanicDirectory
{
    private readonly HashSet<Guid> _active = activeIds.ToHashSet();

    public Task<MechanicSummary?> GetAsync(Guid mechanicId, CancellationToken ct = default)
        => Task.FromResult(_active.Contains(mechanicId)
            ? new MechanicSummary(mechanicId, "Test", "0770000000", "EMP-100", true, true)
            : null);

    public Task<IReadOnlyList<MechanicSummary>> ListAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<MechanicSummary>>(Array.Empty<MechanicSummary>());
}
