# Fixora shared backend (.NET 10)

**One** ASP.NET Core host serves all three products, one SQL Server database, one SignalR hub.
Each team owns its full vertical (Api → Application → Domain → Infrastructure → Contracts); `src/Shared` is cross-cutting only.

```
src/
  Host/Fixora.Host                      Program.cs: wires the three API surfaces, the hub, auth, rate limits, seeding
  Customer/Fixora.Customer.*            /api/v1/customer/*   18 controllers: auth (email OTP), vehicles, DriveSense, SOS, loyalty,
                                                             bookings/queue/jobs/approvals/invoices via the manager gateway
  Mechanic/Fixora.Mechanic.*            /api/v1/mechanic/*   PIN login, invitations, assigned jobs, FixProof capture + AI draft, SOS alerts
  Manager/Fixora.Manager.*              /api/v1/manager/*    canonical bookings, job cards, approvals, billing, inventory, Smart Advisor
  Shared/Fixora.SharedKernel            entities, errors (→ ApiErrorResponse), roles, clock
  Shared/Fixora.Shared.Contracts        realtime events/groups, notification types, auth DTOs
  Shared/Fixora.Shared.Infrastructure   JWT + refresh tokens, PBKDF2, SignalR hub + NotificationService, private media, error middleware
tests/
  Fixora.Tests                          xUnit: approval state machine, detectors, rules, in-memory API flow
  e2e/realtime_e2e.py                   live hub test: who receives each hand-off (27 checks)
docs/architecture/realtime-approval-routing.md
database/README.md · deployment/README.md · Dockerfile · docker-compose.yml
```

Canonical ownership rule: the **manager** context owns appointments, job cards, proposals, approvals and invoices;
the customer and mechanic APIs act on them only through gateways (`IWorkshopGateway`, approvals/job gateways).

## Run

```bash
cd shared-backend
dotnet run --project src/Host/Fixora.Host --launch-profile "Fixora (in-memory demo)"   # no SQL Server needed
# or SQL Server:  docker compose up --build
```

API on http://localhost:5080 · health `/health` · OpenAPI `/openapi/v1.json` · hub `/hubs/fixora`.

| Role | Login |
|---|---|
| Owner | `owner@fixora.lk` / `Fixora@123` |
| Manager | `manager@fixora.lk` / `Fixora@123` |
| Customer | `kavitha@fixora.lk` / `Fixora@123` (also `arun@fixora.lk`) |
| Mechanic | PIN login `EMP-001` / `1234` (Ravi), `EMP-002` / `2345`, `EMP-003` / `3456` |

## Test

```bash
dotnet test
python tests/e2e/realtime_e2e.py http://localhost:5080     # pip install -r tests/e2e/requirements.txt
```
