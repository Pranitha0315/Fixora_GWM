using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Fixora.Shared.Infrastructure.Persistence;

public static class ModelBuilderExtensions
{
    /// <summary>
    /// Ids are created in code (Guid.NewGuid). Telling EF they are never store-generated makes
    /// children added to a tracked aggregate's collection (e.g. SOS status history) INSERTs, not UPDATEs.
    /// Call at the end of OnModelCreating.
    /// </summary>
    public static ModelBuilder UseClientGeneratedGuids(this ModelBuilder b)
    {
        foreach (var entity in b.Model.GetEntityTypes())
        {
            var id = entity.FindProperty("Id");
            if (id is not null && id.ClrType == typeof(Guid))
                id.ValueGenerated = ValueGenerated.Never;
        }
        return b;
    }
}
