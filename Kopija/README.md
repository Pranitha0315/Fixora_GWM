# Kopija — Customer App: booking audit (check only, no code change expected)

The booking audit (Narmatha, 25 Nov) found backend problems in **manager-side** booking.
The customer booking API is **unchanged**, so your app should keep working. Please check that after Thanujan's fix is merged.

## What changed that touches the customer
- `BookingDto` has a new field `managerNote`. **For customers it is always `null`**: the manager's note is internal.
  If your app maps booking JSON strictly, ignore unknown fields (Dart `json['x']` mapping already does).
- The manager can no longer confirm two bookings for the same mechanic/bay at the same time, so customers get fewer surprise reschedules.
- Booking times: the manager's day view now uses the **Sri Lanka local date**. The customer app already shows local time, so nothing changes.

## Test (after the backend fix, before you mark booking QA done)
1. Book a service from the app → it shows as **Requested**.
2. Manager confirms it with a note ("Check the rear drums too") → the app shows **Confirmed**, the bay and the mechanic name, and **no manager note anywhere** (booking list, booking detail, notification, live job screen).
3. Book at an early slot (the first slot of the day) → the time shown in the app = the time the manager sees.
4. Cancel / reschedule still work (same API as before).
5. If anything shows `managerNote` text in the customer app → tell Thanujan (that would be a privacy bug).
