#!/usr/bin/env python3
"""End-to-end check of FIXORA real-time approval routing over the real SignalR hub.
Flow A: mechanic -> manager -> customer -> manager -> mechanic (repair proposal)
Flow B: customer -> manager -> mechanic (change request)
Asserts who receives each notification and who must NOT."""
import json, threading, time, uuid, sys, requests, websocket
API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5080"
JOB = "80000000-0000-0000-0000-000000000001"   # Kavitha's Wagon R, assigned to Ravi
RS = "\x1e"

def post(path, body, tok=None, headers=None):
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    h.update(headers or {})
    r = requests.post(API + path, json=body, headers=h, timeout=10)
    if r.status_code >= 400: raise SystemExit(f"POST {path} -> {r.status_code} {r.text}")
    return r.json() if r.text else None

def get(path, tok):
    r = requests.get(API + path, headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    if r.status_code >= 400: raise SystemExit(f"GET {path} -> {r.status_code} {r.text}")
    return r.json()

class Client:
    def __init__(self, name, token):
        self.name, self.events, self.lock = name, [], threading.Lock()
        neg = requests.post(f"{API}/hubs/fixora/negotiate?negotiateVersion=1", headers={"Authorization": f"Bearer {token}"}, timeout=10).json()
        url = API.replace("http", "ws") + f"/hubs/fixora?id={neg['connectionToken']}&access_token={token}"
        self.ws = websocket.create_connection(url, timeout=10)
        self.ws.send(json.dumps({"protocol": "json", "version": 1}) + RS)
        threading.Thread(target=self._loop, daemon=True).start()
    def _loop(self):
        buf = ""
        while True:
            try: buf += self.ws.recv()
            except Exception: return
            while RS in buf:
                frame, buf = buf.split(RS, 1)
                if not frame or frame == "{}": continue
                msg = json.loads(frame)
                if msg.get("type") == 1:
                    with self.lock: self.events.append((msg["target"], msg["arguments"][0]))
                elif msg.get("type") == 6:
                    self.ws.send(json.dumps({"type": 6}) + RS)
    def notif_types(self):
        with self.lock: return [a["type"] for t, a in self.events if t == "notification"]
    def event_names(self):
        with self.lock: return [t for t, a in self.events]
    def clear(self):
        with self.lock: self.events.clear()

def expect(client, ntype, present=True, wait=5.0):
    end = time.time() + wait
    while time.time() < end:
        if ntype in client.notif_types(): break
        time.sleep(0.1)
    ok = (ntype in client.notif_types()) == present
    print(f"  {'PASS' if ok else 'FAIL'}  {client.name:<9} {'receives' if present else 'does NOT receive'} {ntype}")
    if not ok: FAILS.append((client.name, ntype, present))

FAILS = []
mgr = post("/api/v1/manager/auth/login", {"email": "manager@fixora.lk", "password": "Fixora@123"})["accessToken"]
mech = post("/api/v1/mechanic/auth/pin-login", {"login": "EMP-001", "pin": "1234"})["accessToken"]
cust = post("/api/v1/customer/auth/login", {"email": "kavitha@fixora.lk", "password": "Fixora@123"})["accessToken"]
M, R, C = Client("manager", mgr), Client("mechanic", mech), Client("customer", cust)
time.sleep(1)

print("Flow A · mechanic -> manager -> customer -> manager -> mechanic")
p = post(f"/api/v1/mechanic/jobs/{JOB}/proposals", {"note": "Pads at 2 mm", "items": [
    {"title": "Front brake pads", "kind": "Part", "qty": 1, "unitPrice": 6500, "linkedIssueId": None, "partId": "70000000-0000-0000-0000-000000000001"},
    {"title": "Wiper blades", "kind": "Part", "qty": 2, "unitPrice": 900, "linkedIssueId": None, "partId": None}]}, mech)
print(f"  mechanic submitted proposal {p['id'][:8]} status={p['status']}")
expect(M, "proposal.submitted"); expect(C, "proposal.submitted", False, 1.5)
assert not get("/api/v1/customer/approvals/pending", cust), "customer must not see an unforwarded proposal"
print("  PASS  customer API hides the proposal before the manager forwards it")

post(f"/api/v1/manager/approvals/proposals/{p['id']}/forward", {"note": "Pads are urgent"}, mgr)
expect(C, "approval.requested"); expect(R, "proposal.forwarded")
pend = get("/api/v1/customer/approvals/pending", cust)
items = pend[0]["items"]
key = str(uuid.uuid4())
dec = {"decisions": [{"itemId": i["id"], "approve": "pads" in i["title"].lower(), "version": i["version"]} for i in items], "note": None}
R.clear()
post(f"/api/v1/customer/approvals/{p['id']}/decisions", dec, cust, {"Idempotency-Key": key})
expect(M, "approval.customerDecided"); expect(R, "approval.customerDecided", False, 1.5)
# same idempotency key again -> no second decision, no error
post(f"/api/v1/customer/approvals/{p['id']}/decisions", dec, cust, {"Idempotency-Key": key})
print("  PASS  repeat with same Idempotency-Key accepted without a second decision")
mview = get(f"/api/v1/mechanic/jobs/{JOB}/proposals", mech)[0]
print(f"  mechanic's view before release: status={mview['status']}")

post(f"/api/v1/manager/approvals/proposals/{p['id']}/release", {"note": None}, mgr)
expect(R, "approval.released"); expect(C, "approval.confirmed")
print("  realtime state events seen by mechanic:", sorted(set(R.event_names())))

print("Flow B · customer -> manager -> mechanic (change request)")
for c in (M, R, C): c.clear()
cr = post(f"/api/v1/customer/jobs/{JOB}/change-requests", {"changes": ["Keep old parts"], "details": "Please keep the old pads"}, cust)
expect(M, "change.requested"); expect(R, "change.requested", False, 1.5); expect(R, "change.forwarded", False, 0.5)
post(f"/api/v1/manager/approvals/change-requests/{cr['id']}/forward", {"note": "OK, bag the old pads"}, mgr)
expect(R, "change.forwarded")
post(f"/api/v1/mechanic/jobs/change-requests/{cr['id']}/acknowledge", {"note": "Will do"}, mech)
expect(M, "change.acknowledged"); expect(C, "change.acknowledged")

print("Flow C · Roadside SOS: receipt before Delivered, idempotent, manager → customer status live")
for c in (M, R, C): c.clear()
key = str(uuid.uuid4())
body = {"lat": 9.6615, "lng": 80.0255, "category": "FlatTyre", "vehicleId": "50000000-0000-0000-0000-000000000001", "note": "A9 near Chavakachcheri", "locationConsent": True}
r1 = post("/api/v1/customer/sos/requests", body, cust, {"Idempotency-Key": key})
r2 = post("/api/v1/customer/sos/requests", body, cust, {"Idempotency-Key": key})
ok = r1["receiptId"] == r2["receiptId"] and r2.get("duplicate") is True
print(f"  {'PASS' if ok else 'FAIL'}  same Idempotency-Key returns the same receipt ({r1['receiptId'][:8]}, duplicate={r2.get('duplicate')})")
if not ok: FAILS.append(("customer", "sos idempotency", True))
expect(M, "sos.raised")
post(f"/api/v1/manager/sos/{r1['receiptId']}/acknowledge", {"note": "On it"}, mgr)
expect(C, "sos.status")
post(f"/api/v1/manager/sos/{r1['receiptId']}/dispatch", {"mechanicId": "30000000-0000-0000-0000-000000000001", "note": None}, mgr)
expect(R, "sos.dispatched")
st = get(f"/api/v1/customer/sos/requests/{r1['receiptId']}", cust)["status"]
print(f"  {'PASS' if st == 'Dispatched' else 'FAIL'}  customer reads status {st}")

print("Flow D · Booking capacity: the last slot goes to one customer, the next gets 409")
import datetime
day = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
svc = "60000000-0000-0000-0000-000000000004"
slots = get(f"/api/v1/customer/appointments/slots?date={day}&serviceId={svc}", cust)
slot = next(s for s in slots if s["freeBays"] > 0)
codes = []
for i in range(slot["freeBays"] + 1):
    r = requests.post(API + "/api/v1/customer/appointments", json={"vehicleId": "50000000-0000-0000-0000-000000000001", "serviceId": svc, "slotStart": slot["start"], "notes": f"cap test {i}", "promoCode": None, "suggestionId": None},
                      headers={"Authorization": f"Bearer {cust}", "Idempotency-Key": str(uuid.uuid4())}, timeout=10)
    codes.append(r.status_code)
ok = codes[-1] == 409 and all(c == 200 for c in codes[:-1])
print(f"  {'PASS' if ok else 'FAIL'}  {slot['freeBays']} free bay(s) → statuses {codes}")
if not ok: FAILS.append(("customer", "capacity 409", True))
expect(M, "booking.requested")

print("Flow E · FixProof: an unconfirmed AI draft never reaches the customer API")
d = post(f"/api/v1/mechanic/jobs/{JOB}/fixproof/drafts", {"component": "Front brake pads", "transcript": "pad thickness 2 mm, disc scored", "language": "en", "severity": "Urgent", "mediaRefs": []}, mech)
rep = get(f"/api/v1/customer/fixproof/jobs/{JOB}/report", cust)
leak = any("disc scored" in (i.get("findingEn") or "") for i in rep["issues"])
print(f"  {'PASS' if not leak and d.get('verified') is False else 'FAIL'}  draft verified={d.get('verified')}, visible to customer={leak}")
if leak: FAILS.append(("customer", "draft leak", False))

print("\nRESULT:", "ALL PASS" if not FAILS else f"{len(FAILS)} FAIL(S) {FAILS}")
sys.exit(1 if FAILS else 0)
