"""
Tries to mutate one tenant's consignments while signed in as another.

Every line should say "blocked". Kept because this found five endpoints that
said 200 — a competitor could cancel your delivery by knowing its reference.

    python Drishya.Backend/scripts/tenant-write-audit.py
"""

import json, urllib.request, urllib.error

API = "http://localhost:8080"

def login(role):
    q = urllib.request.Request(API+"/api/auth/demo-login",
        data=json.dumps({"role": role}).encode(), headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(q).read())["token"]

def call(method, path, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API+path, data=data, method=method)
    req.add_header("Authorization", "Bearer "+token)
    if data: req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

V1, V2 = login("vendor_admin"), login("dispatcher")

# A shipment that belongs to vendor-1. vendor-2 must not be able to touch it.
r = urllib.request.Request(API+"/api/shipments/all"); r.add_header("Authorization","Bearer "+V1)
mine = json.loads(urllib.request.urlopen(r).read())
target = next((s for s in mine if s.get("status") in ("created","docs_pending","in_transit")), mine[0])
SID = target["id"]

print("vendor-1 owns %s (%s). Attempting mutation as vendor-2:\n" % (SID, target.get("status")))

ATTEMPTS = [
    ("POST",  "/api/shipments/%s/advance"   % SID, {"status":"at_gate","label":"hijack"}),
    ("POST",  "/api/shipments/%s/cancel"    % SID, {"reason":"hijack"}),
    ("PATCH", "/api/shipments/%s/dock"      % SID, {"dockId":"fc-bhiwandi-dock-1"}),
    # Well-formed on purpose. A body the parser rejects returns 400 without ever
    # reaching the ownership check, which reads as "not blocked" and is not.
    ("POST",  "/api/shipments/%s/pod"       % SID,
        {"receiverName":"hijack","cartonsReceived":1,"photos":0,"damageNote":None,"signature":None}),
    ("POST",  "/api/shipments/%s/checklist" % SID,
        {"sealNumber":"HIJACK99","notes":"x","photos":0,"failures":[]}),
    ("GET",   "/api/shipments/%s"           % SID, None),
    ("GET",   "/api/v1/shipments/%s/evidence-pack" % SID, None),
    ("POST",  "/api/v1/shipments/%s/asn"    % SID, {"poReference":"PO-000000","declaredCartons":1}),
    ("POST",  "/api/v1/trips/from-shipment/%s" % SID, {"vehicleRegistration":"HIJACK-1"}),
]

leaks = []
print("  %-6s %-46s %s" % ("method", "path", "as vendor-2"))
print("  " + "-"*74)
for method, path, body in ATTEMPTS:
    code = call(method, path, V2, body)
    # 400 is deliberately NOT counted as blocked: it means the request was
    # rejected before authorisation ran, so it proves nothing either way.
    blocked = code in (403, 404, 409)
    if not blocked: leaks.append("%s %s -> %d" % (method, path, code))
    print("  %-6s %-46s %d  %s" % (method, path, code, "blocked" if blocked else "*** ALLOWED ***"))

print()
print("Unprotected write/read paths: %d" % len(leaks))
for l in leaks: print("  -", l)
