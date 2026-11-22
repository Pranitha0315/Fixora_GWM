# Database

One SQL Server database (`FixoraDb`), one schema per owner:

| Schema | DbContext | Owns |
|---|---|---|
| `shared` | `SharedDbContext` | notifications, device tokens, refresh tokens |
| `customer` | `CustomerDbContext` | customers, OTP, vehicles, SOS, trips, wear profiles, suggestions, loyalty |
| `mechanic` | `MechanicDbContext` | mechanic identity / PIN, FixProof drafts, captured media |
| `workshop` | `ManagerDbContext` | appointments, bays, job cards, proposals, approvals, invoices, inventory, advisor |

**Phase 1 (demo):** on start-up each context creates its own tables when its schema is empty
(`DatabaseSetup.EnsureSchemaAsync`) and the demo garage is seeded (`Database:Seed=true`).
Run without SQL Server: `ASPNETCORE_ENVIRONMENT=Demo` (in-memory provider).

**Before production:** switch to EF Core migrations, one migrations folder per context:

```bash
dotnet tool install --global dotnet-ef
cd shared-backend
dotnet ef migrations add Initial -c SharedDbContext   -p src/Shared/Fixora.Shared.Infrastructure     -s src/Host/Fixora.Host -o Persistence/Migrations
dotnet ef migrations add Initial -c CustomerDbContext -p src/Customer/Fixora.Customer.Infrastructure -s src/Host/Fixora.Host -o Persistence/Migrations
dotnet ef migrations add Initial -c MechanicDbContext -p src/Mechanic/Fixora.Mechanic.Infrastructure -s src/Host/Fixora.Host -o Persistence/Migrations
dotnet ef migrations add Initial -c ManagerDbContext  -p src/Manager/Fixora.Manager.Infrastructure   -s src/Host/Fixora.Host -o Persistence/Migrations
```

Then replace `EnsureSchemaAsync` with `Database.MigrateAsync()` and back up with `BACKUP DATABASE FixoraDb TO DISK = …` (NFR-10).
