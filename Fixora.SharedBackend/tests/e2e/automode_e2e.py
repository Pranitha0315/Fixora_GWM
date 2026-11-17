#!/usr/bin/env python3
"""End-to-end check of Manager mode / Auto mode.
1. Manager mode + manager online: a proposal waits for the manager (nothing automatic).
2. Manager switches to Auto: the waiting proposal goes to the customer by itself,
   the customer's decision is released to the mechanic, a change request reaches the mechanic,
   a booking is confirmed, an SOS is dispatched. Customers still decide every item.
3. Hold limit: a proposal above the limit waits for the manager even in Auto mode.
4. Manager mode again; then the manager goes offline -> Auto takes over after AwayMinutes.
Usage: automode_e2e.py [api]"""
import datetime, json, sys, threading, time, uuid
import requests, websocket

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5080"
JOB = "80000000-0000-0000-0000-000000000001"
RS = "\x1e"
FAILS = []


def call(method, path, tok=None, body=None, headers=None, ok=(200, 201, 204)):
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    h.update(headers or {})
    r = requests.request(method, API + path, json=body, headers=h, timeout=15)
    if r.status_code not in ok:
        raise SystemExit(f"{method} {path} -> {r.status_code} {r.text}")
    return r.json() if r.text else None


def check(name, cond):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        FAILS.append(name)


def wait_for(fn, timeout=15.0):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(0.5)
    return fn()


class Hub:
    """Staff dashboard connection: while it is open the manager counts as online."""
    def __init__(self, token):
        neg = requests.post(f"{API}/hubs/fixora/negotiate?negotiateVersion=1", headers={"Authorization": f"Bearer {token}"}, timeout=10).json()
        self.ws = websocket.create_connection(API.replace("http", "ws") + f"/hubs/fixora?id={neg['connectionToken']}&access_token={token}", timeout=10)
        self.ws.send(json.dumps({"protocol": "json", "version": 1}) + RS)
        self.events = []
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        buf = ""
        while True:
            try:
                buf += self.ws.recv()
            except Exception:
                return
            while RS in buf:
                frame, buf = buf.split(RS, 1)
                if frame and frame != "{}":
                    m = json.loads(frame)
                    if m.get("type") == 1:
                        self.events.append(m["target"])
                    elif m.get("type") == 6:
                        self.ws.send(json.dumps({"type": 6}) + RS)

    def close(self):
        self.ws.close()


def settings(mgr, **kw):
    s = call("GET", "/api/v1/manager/control", mgr)
    body = {k: s[k] for k in ("mode", "autoWhenAway", "awayMinutes", "holdAboveRupees", "autoBookings", "autoSos")}
    body.update(kw)
    return call("PUT", "/api/v1/manager/control", mgr, body)


def proposal(mech, items):
    return call("POST", f"/api/v1/mechanic/jobs/{JOB}/proposals", mech, {"note": "Auto mode test", "items": items})


def status_of(mgr, pid):
    return next((p["status"] for p in call("GET", "/api/v1/manager/approvals/proposals", mgr) if p["id"] == pid), None)


mgr = call("POST", "/api/v1/manager/auth/login", body={"email": "manager@fixora.lk", "password": "Fixora@123"})["accessToken"]
mech = call("POST", "/api/v1/mechanic/auth/pin-login", body={"login": "EMP-001", "pin": "1234"})["accessToken"]
cust = call("POST", "/api/v1/customer/auth/login", body={"email": "kavitha@fixora.lk", "password": "Fixora@123"})["accessToken"]

print("1 · Manager mode, manager online")
hub = Hub(mgr)
time.sleep(1)
s = settings(mgr, mode="Manager", autoWhenAway=True, awayMinutes=1, holdAboveRupees=0)
check("effective mode is Manager while the dashboard is open", s["effectiveMode"] == "Manager" and s["managersOnline"] >= 1)
p1 = proposal(mech, [{"title": "Front brake pads", "kind": "Part", "qty": 1, "unitPrice": 6500, "linkedIssueId": None, "partId": None},
                     {"title": "Wiper blades", "kind": "Part", "qty": 2, "unitPrice": 900, "linkedIssueId": None, "partId": None}])
time.sleep(7)
check("proposal waits for the manager", status_of(mgr, p1["id"]) == "PendingManagerReview")

print("2 · Switch to Auto mode")
hub.events.clear()
s = settings(mgr, mode="Auto")
check("effective mode is Auto", s["effectiveMode"] == "Auto")
check("waiting proposal sent to the customer at once", status_of(mgr, p1["id"]) == "AwaitingCustomer")
check("staff got control.updated in real time", wait_for(lambda: "control.updated" in hub.events, 5))
pend = call("GET", "/api/v1/customer/approvals/pending", cust)
check("customer sees it and must still decide", len(pend) == 1 and all(i["status"] == "AwaitingCustomer" for i in pend[0]["items"]))
dec = {"decisions": [{"itemId": i["id"], "approve": "pads" in i["title"].lower(), "version": i["version"]} for i in pend[0]["items"]], "note": None}
call("POST", f"/api/v1/customer/approvals/{p1['id']}/decisions", cust, dec, {"Idempotency-Key": str(uuid.uuid4())})
check("customer decision released to the mechanic by Auto mode",
      wait_for(lambda: status_of(mgr, p1["id"]) == "ReleasedToMechanic", 15))
mv = call("GET", f"/api/v1/mechanic/jobs/{JOB}/proposals", mech)[0]
check("mechanic sees approved pads, rejected wipers",
      sorted(i["status"] for i in mv["items"]) == ["Rejected", "Released"])
audit = next(p for p in call("GET", "/api/v1/manager/approvals/proposals", mgr) if p["id"] == p1["id"])["audit"]
check("audit trail says Auto mode did it", any(a["actorRole"] == "Auto" for a in audit))

cr = call("POST", f"/api/v1/customer/jobs/{JOB}/change-requests", cust, {"changes": ["Keep old parts"], "details": "Bag the old pads"})
check("change request forwarded to the mechanic", wait_for(lambda: any(
    c["id"] == cr["id"] and c["status"] == "ForwardedToMechanic" for c in call("GET", "/api/v1/manager/approvals/change-requests?pendingOnly=false", mgr)), 15))

day = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
svc = "60000000-0000-0000-0000-000000000004"
slot = next(x for x in call("GET", f"/api/v1/customer/appointments/slots?date={day}&serviceId={svc}", cust) if x["freeBays"] > 0)
bk = call("POST", "/api/v1/customer/appointments", cust, {"vehicleId": "50000000-0000-0000-0000-000000000001", "serviceId": svc,
          "slotStart": slot["start"], "notes": "auto mode", "promoCode": None, "suggestionId": None}, {"Idempotency-Key": str(uuid.uuid4())})
check("booking confirmed with a bay and a mechanic", wait_for(lambda: any(
    b["id"] == bk["id"] and b["status"] == "Confirmed" and b["bayId"] and b["mechanicId"] for b in call("GET", "/api/v1/customer/appointments", cust)), 15))

sos = call("POST", "/api/v1/customer/sos/requests", cust, {"vehicleId": "50000000-0000-0000-0000-000000000001", "lat": 9.66, "lng": 80.02,
           "category": "FlatTyre", "note": "Engine stopped", "locationConsent": True}, {"Idempotency-Key": str(uuid.uuid4())})
check("SOS acknowledged and dispatched", wait_for(lambda: call("GET", f"/api/v1/customer/sos/requests/{sos['receiptId']}", cust)["status"] == "Dispatched", 15))

print("3 · Hold limit in Auto mode")
settings(mgr, holdAboveRupees=10000)
p2 = proposal(mech, [{"title": "Clutch kit", "kind": "Part", "qty": 1, "unitPrice": 42000, "linkedIssueId": None, "partId": None}])
time.sleep(7)
check("Rs 42,000 proposal held for the manager", status_of(mgr, p2["id"]) == "PendingManagerReview")
st = call("GET", "/api/v1/manager/control", mgr)
check("held item listed for the manager", st["heldWaiting"] >= 1 and any(a["held"] and a["entityId"] == p2["id"] for a in st["recent"]))
call("POST", f"/api/v1/manager/approvals/proposals/{p2['id']}/return", mgr, {"note": "Check the clutch again"})

print("4 · Manager mode, manager goes away")
s = settings(mgr, mode="Manager", holdAboveRupees=0, awayMinutes=1)
check("back to Manager mode while online", s["effectiveMode"] == "Manager")
hub.close()
time.sleep(2)
s = call("GET", "/api/v1/manager/control", mgr)
check("offline: still Manager mode inside the away time, take-over time shown", s["effectiveMode"] == "Manager" and s["autoTakesOverAt"])
print("  … waiting 65 s for the away time")
check("after 1 min with nobody online, Auto mode takes over",
      wait_for(lambda: call("GET", "/api/v1/manager/control", mgr)["effectiveMode"] == "Auto", 75))
hub = Hub(mgr)
check("manager opens the dashboard again -> Manager mode", wait_for(lambda: call("GET", "/api/v1/manager/control", mgr)["effectiveMode"] == "Manager", 10))
items = call("GET", "/api/v1/notifications", mgr)
check("welcome-back summary notification", any(n["type"] == "control.modeChanged" and "Welcome back" in n["body"] for n in items))
call("POST", "/api/v1/manager/control/seen", mgr)
check("activity marked seen", call("GET", "/api/v1/manager/control", mgr)["unseenActions"] == 0)
hub.close()

print(f"\n{'ALL PASSED' if not FAILS else f'{len(FAILS)} FAILED: {FAILS}'}")
sys.exit(1 if FAILS else 0)
