namespace Fixora.Customer.Application.DriveSense;

/// <summary>Decodes a geohash cell to its centre point (5 chars ≈ 4.9 km × 4.9 km — coarse on purpose, BR-DS-04).</summary>
public static class Geohash
{
    private const string Base32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    public static (double Lat, double Lng)? Centre(string hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return null;
        double latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
        var even = true;
        foreach (var c in hash.Trim().ToLowerInvariant())
        {
            var idx = Base32.IndexOf(c);
            if (idx < 0) return null;
            for (var bit = 4; bit >= 0; bit--)
            {
                var on = ((idx >> bit) & 1) == 1;
                if (even) { var mid = (lngMin + lngMax) / 2; if (on) lngMin = mid; else lngMax = mid; }
                else { var mid = (latMin + latMax) / 2; if (on) latMin = mid; else latMax = mid; }
                even = !even;
            }
        }
        return ((latMin + latMax) / 2, (lngMin + lngMax) / 2);
    }
}
