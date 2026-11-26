# FIXORA — Booking audit (Narmatha, 25 Nov 2026): who does what

**Audit result:** 22/22 old tests pass, 2/11 booking tests pass → **NO-GO**. All 11 findings were checked in the code and are **valid**.
**Status of the fix:** backend fix + new tests written and compile-checked (BUILD OK). Waiting for the team leader's OK on 4 rules, then merge + re-test.

| Who | What | Zip |
|---|---|---|
| **Team Leader** | OK the 4 rules (off-duty future booking, priority 0/1/2, manager note, paging) | `FIXORA_TeamLeader_BookingAudit.zip` |
| **Thanujan** | Apply the backend fix F01–F11, run the migration script, `dotnet test`, change the old `sa` password, push | `FIXORA_Thanujan_BookingAudit.zip` |
| **Nidhushiya** | Code review of Thanujan's diff (checklist) | `FIXORA_Nidhushiya_BookingAudit.zip` |
| **Narmatha** | Angular: paged booking list, note for the mechanic, priority labels, off-duty in walk-in. Update and re-run her 11 tests | `FIXORA_Narmatha_BookingAudit.zip` |
| **Kabishan** | Mechanic app: show "Manager note" on the job | `FIXORA_Kabishan_BookingAudit.zip` |
| **Kopija** | Customer app: check only (the manager note must never appear) | `FIXORA_Kopija_BookingAudit.zip` |
| **Praneetha** | Re-test on **real SQL Server** (incl. two managers confirming at the same moment) → GO / NO-GO | `FIXORA_Praneetha_BookingAudit.zip` |

## Agreed rules (proposed; final after the team leader's OK)
1. **Future booking**: an off-duty mechanic is OK (must exist + be Active). **Walk-in**: the mechanic must be On duty.
2. **Priority**: 0 Normal · 1 High · 2 Urgent. Anything else → 400.
3. **Manager note**: separate `managerNote` (≤ 500). Staff + the assigned mechanic see it, the customer never does.
4. **Booking list**: paged → `{ items, page, pageSize, total }` (pageSize ≤ 100).
5. **Overlap**: the same mechanic or the same bay, overlapping Confirmed/CheckedIn → **409** `mechanic_busy` / `bay_busy`. Back-to-back is OK.
6. **Date filter** = Sri Lanka local date.
7. **No passwords in code**: the connection string comes from Development/Local settings or environment variables.

## Order
Team leader OK → **Thanujan** merges → **Nidhushiya** reviews → **Narmatha** + **Kabishan** + **Kopija** update/check → **Narmatha** re-runs 11 tests → **Praneetha** SQL Server test → booking **GO**.
