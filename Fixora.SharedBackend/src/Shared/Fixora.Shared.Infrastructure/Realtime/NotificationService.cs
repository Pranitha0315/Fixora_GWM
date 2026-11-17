
        r.DataJson is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(r.DataJson),
        r.Read, r.CreatedAt);
}
