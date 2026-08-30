#!/usr/bin/env bash
# Exercises the API the way the frontend will.
API=http://localhost:8080/api
pass=0; fail=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1));
  else fail=$((fail+1)); echo "  FAIL  $1 — expected $2, got $3"; fi
}
checkne() { # name actual (must be non-empty and not null)
  if [ -n "$2" ] && [ "$2" != "null" ]; then pass=$((pass+1));
  else fail=$((fail+1)); echo "  FAIL  $1 — got '$2'"; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)" 2>/dev/null; }
jlen() { python3 -c "import sys,json;print(len(json.load(sys.stdin)$1))" 2>/dev/null; }

echo "--- auth ---"
check "unauthenticated call is rejected" 401 "$(code $API/shipments)"

TOKEN=$(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json' \
  -d '{"role":"vendor_admin"}' | j "['token']")
checkne "demo-login returns a token" "$TOKEN"
AUTH="Authorization: Bearer $TOKEN"

# A fulfilment centre token as well. Gate-in, gate-out and GRN are the
# receiving desk's actions and are now restricted to the FC role. This suite
# used to call them with the vendor token and pass, because the hand-rolled
# filter had no per-role authorisation at all — the test was relying on the
# gap. It holds the right credential now.
FC_TOKEN=$(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json' \
  -d '{"role":"fc"}' | j "['token']")
FC_AUTH="Authorization: Bearer $FC_TOKEN"
checkne "fc demo-login returns a token" "$FC_TOKEN"

ROLE=$(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json' \
  -d '{"role":"fc"}' | j "['user']['role']")
check "demo-login honours the role" "fc" "$ROLE"

check "bad credentials rejected" 401 "$(code -X POST $API/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"wrong"}')"

LOGIN_ROLE=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya@anandauto.example","password":"drishya"}' | j "['user']['role']")
check "real login works" "vendor_admin" "$LOGIN_ROLE"

HASPW=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya@anandauto.example","password":"drishya"}' | grep -c password)
check "password never returned" 0 "$HASPW"

check "garbage token rejected" 401 "$(code -H 'Authorization: Bearer nonsense' $API/shipments)"

echo "--- reference data ---"
check "fulfilment centres" 4 "$(curl -s -H "$AUTH" $API/fulfilment-centres | jlen "")"
# A vendor sees only itself here. VendorDto carries shipment volume, on-time
# rate, document accuracy and rejection rate — a competitor's commercial
# performance — so the full directory is for the receiving desk, not for peers.
check "vendor directory is scoped to self" 1 "$(curl -s -H "$AUTH" $API/vendors | jlen "")"
check "vehicles" 25 "$(curl -s -H "$AUTH" $API/vehicles | jlen "")"
check "drivers" 20 "$(curl -s -H "$AUTH" $API/drivers | jlen "")"
check "carriers" 5 "$(curl -s -H "$AUTH" $API/carriers | jlen "")"
check "docks" 31 "$(curl -s -H "$AUTH" $API/docks | jlen "")"

echo "--- shipments ---"
# Scoped to the caller's tenant, not the whole cluster. This used to assert
# >= 60 — every seeded shipment — which was asserting the leak.
check "shipments are tenant-scoped" "True" "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | python3 -c "import sys,json
d=json.load(sys.stdin)
print(0 < d['total'] < 60)")"
check "page size is not exceeded" "True" "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['rows'])<=25)")"
check "page count is consistent with the total" "True" "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | python3 -c "
import sys,json,math
d=json.load(sys.stdin)
print(d['pageCount']==max(1,math.ceil(d['total']/d['pageSize'])))")"
check "status filter" "delivered" "$(curl -s -H "$AUTH" "$API/shipments?status=delivered" | j "['rows'][0]['status']")"
check "listAll is scoped too" "True" "$(curl -s -H "$AUTH" $API/shipments/all | python3 -c "import sys,json
rows=json.load(sys.stdin)
print(len(rows) > 0 and len({r['vendorId'] for r in rows}) == 1)")"
check "unknown shipment 404s" 404 "$(code -H "$AUTH" $API/shipments/SHP-99999)"

SID=$(curl -s -H "$AUTH" "$API/shipments?pageSize=1" | j "['rows'][0]['id']")
checkne "got a shipment id" "$SID"

DETAIL=$(curl -s -H "$AUTH" $API/shipments/$SID)
checkne "detail has events" "$(echo "$DETAIL" | j "['events'][0]['stage']")"
# Six since POD joined DocumentType alongside eway, invoice, gst, lr and asn.
check "detail has 6 documents" 6 "$(echo "$DETAIL" | jlen "['documents']")"
checkne "detail has route" "$(echo "$DETAIL" | j "['route'][0]['lat']")"
checkne "detail has position" "$(echo "$DETAIL" | j "['position']['lat']")"
checkne "detail has lane" "$(echo "$DETAIL" | j "['lane']")"
check "temperature series present" 24 "$(echo "$DETAIL" | jlen "['sensors']['temperature']")"

echo "--- wire format (the contract with the browser) ---"
TS=$(echo "$DETAIL" | j "['promisedAt']")
check "promisedAt is a number not a string" "True" "$(echo "$DETAIL" | python3 -c "import sys,json;print(isinstance(json.load(sys.stdin)['promisedAt'],int))")"
check "timestamp is epoch millis (13 digits)" 13 "${#TS}"
check "status is snake_case wire value" "True" "$(echo "$DETAIL" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'] in ['created','docs_pending','in_transit','at_gate','at_dock','delivered','exception','cancelled'])")"
check "device status keeps its hyphen" "True" "$(curl -s -H "$AUTH" $API/vehicles | python3 -c "import sys,json;print(any(v['deviceStatus']=='low-battery' for v in json.load(sys.stdin)))")"

echo "--- alerts and exceptions ---"
checkne "alerts returned" "$(curl -s -H "$AUTH" $API/alerts | jlen "")"
check "severity filter" "True" "$(curl -s -H "$AUTH" "$API/alerts?severity=critical" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(a['severity']=='critical' for a in d))")"
check "exception status filter" "True" "$(curl -s -H "$AUTH" "$API/exceptions?fcId=fc-bhiwandi&status=open" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(e['status']=='open' for e in d))")"

echo "--- appointments and conflicts ---"
checkne "appointments returned" "$(curl -s -H "$AUTH" "$API/appointments?fcId=fc-bhiwandi" | jlen "")"
# A window far enough out, and unique per run, so re-running the suite does
# not collide with the booking the previous run made.
START=$(python3 -c "import time,random;print((int(time.time()+4*86400)//3600*3600 + random.randint(200,4000)*3600)*1000)")
A1=$(curl -s -X POST $API/appointments -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"vendorId\":\"vendor-1\",\"vendorName\":\"Test\",\"fcId\":\"fc-bhiwandi\",\"dockId\":\"fc-bhiwandi-dock-1\",\"start\":$START,\"durationMin\":60}")
check "appointment created as requested" "requested" "$(echo "$A1" | j "['status']")"
check "overlapping booking is refused" 409 "$(code -X POST $API/appointments -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"vendorId\":\"vendor-2\",\"vendorName\":\"Other\",\"fcId\":\"fc-bhiwandi\",\"dockId\":\"fc-bhiwandi-dock-1\",\"start\":$((START+900000)),\"durationMin\":60}")"
checkne "conflict endpoint reports the clash" "$(curl -s -H "$AUTH" "$API/appointments/conflict?dockId=fc-bhiwandi-dock-1&start=$((START+900000))&durationMin=60" | j "['vendorName']")"

echo "--- fulfilment centre ---"
# These are the receiving desk's own screens, so they need the FC token. They
# used the vendor one and passed, because the endpoints were unscoped — a vendor
# could read an arrival board showing every other vendor's inbound.
FCAUTH0="Authorization: Bearer $(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json' -d '{"role":"fc"}' | j "['token']")"
check "a vendor cannot read a receiving desk's board" 403 "$(code $API/fc/fc-bhiwandi/arrivals -H "$AUTH")"
checkne "arrival board" "$(curl -s -H "$FCAUTH0" "$API/fc/fc-bhiwandi/arrivals?window=active" | jlen "")"
# Nulls last. predictedAt is legitimately absent when the ETA engine has
# withdrawn an estimate rather than serve one built on a stale position, and
# those consignments belong at the end of the board, not excluded from it.
check "arrivals sorted by ETA, nulls last" "True" "$(curl -s -H "$FCAUTH0" "$API/fc/fc-bhiwandi/arrivals?window=active" | python3 -c "
import sys,json
d=[s['predictedAt'] for s in json.load(sys.stdin)]
known=[x for x in d if x is not None]
firstnull=next((i for i,x in enumerate(d) if x is None), len(d))
print(known==sorted(known) and all(x is None for x in d[firstnull:]))")"
checkne "yard view" "$(curl -s -H "$FCAUTH0" $API/fc/fc-bhiwandi/yard | jlen "['onSite']")"
checkne "dock schedule" "$(curl -s -H "$FCAUTH0" $API/fc/fc-bhiwandi/dock-schedule | jlen "['docks']")"

echo "--- analytics ---"
check "vendor summary on-time is a percentage" "True" "$(curl -s -H "$AUTH" $API/analytics/vendor/summary | python3 -c "import sys,json;p=json.load(sys.stdin)['onTimePct'];print(0<=p<=100)")"
check "weekly has 14 days" 14 "$(curl -s -H "$AUTH" $API/analytics/vendor/weekly | jlen "")"
checkne "vendor analytics lanes" "$(curl -s -H "$AUTH" $API/analytics/vendor | jlen "['lanes']")"
check "fc heatmap is 6x16" 96 "$(curl -s -H "$AUTH" $API/analytics/fc/fc-bhiwandi | jlen "['heatmap']")"
checkne "fc summary docks" "$(curl -s -H "$AUTH" $API/analytics/fc/fc-bhiwandi/summary | j "['docksTotal']")"

echo "--- documents ---"
checkne "documents listed" "$(curl -s -H "$AUTH" $API/documents | jlen "")"
check "document type filter" "True" "$(curl -s -H "$AUTH" "$API/documents?type=eway" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(x['type']=='eway' for x in d))")"

echo "--- writes ---"
NEW=$(curl -s -X POST $API/shipments -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"vendorId\":\"vendor-1\",\"fcId\":\"fc-bhiwandi\",\"vehicleId\":\"vehicle-5\",\"driverId\":\"driver-2\",
  \"commodity\":\"Footwear\",\"cartons\":100,\"weightKg\":900,\"valueInr\":50000,
  \"invoiceNo\":\"INV/TEST/1\",\"ewayBillNo\":\"371234567890\"}")
NEWID=$(echo "$NEW" | j "['id']")
checkne "shipment created" "$NEWID"
check "created shipment is created" "created" "$(echo "$NEW" | j "['status']")"
check "created shipment has a route" "True" "$(echo "$NEW" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['route'])>=2)")"

check "over-capacity load refused" 400 "$(code -X POST $API/shipments -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"vendorId\":\"vendor-1\",\"fcId\":\"fc-bhiwandi\",\"vehicleId\":\"vehicle-1\",\"driverId\":\"driver-2\",
  \"commodity\":\"Footwear\",\"cartons\":100,\"weightKg\":999999,\"valueInr\":50000}")"
check "validation rejects empty commodity" 400 "$(code -X POST $API/shipments -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"vendorId\":\"vendor-1\",\"fcId\":\"fc-bhiwandi\",\"vehicleId\":\"vehicle-5\",\"driverId\":\"driver-2\",
  \"commodity\":\"\",\"cartons\":0,\"weightKg\":900,\"valueInr\":50000}")"

check "advance to in_transit" "in_transit" "$(curl -s -X POST $API/shipments/$NEWID/advance -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"in_transit","label":"Departed origin"}' | j "['status']")"
check "cannot move backwards" 400 "$(code -X POST $API/shipments/$NEWID/advance -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"created"}')"

POD=$(curl -s -X POST $API/shipments/$NEWID/pod -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"receiverName":"Test Receiver","cartonsReceived":98,"photos":2}')
check "pod completes the shipment" "delivered" "$(echo "$POD" | j "['status']")"
check "pod recorded" "Test Receiver" "$(echo "$POD" | j "['pod']['receiverName']")"
check "over-count pod refused" 400 "$(code -X POST $API/shipments/$NEWID/pod -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"receiverName":"X","cartonsReceived":99999,"photos":1}')"

echo "--- goods receipt raises an exception ---"
BEFORE=$(curl -s -H "$AUTH" "$API/exceptions?fcId=fc-bhiwandi" | jlen "")
UNL=$(curl -s -H "$FCAUTH0" $API/fc/fc-bhiwandi/receiving | j "[0]['id']")
if [ -n "$UNL" ] && [ "$UNL" != "null" ]; then
  CART=$(curl -s -H "$AUTH" $API/shipments/$UNL | j "['cartons']")
  curl -s -X POST $API/fc/shipments/$UNL/grn -H "$FC_AUTH" -H 'Content-Type: application/json' \
    -d "{\"decision\":\"partial\",\"receivedCartons\":$((CART-5)),\"damagedCartons\":2,\"documentsVerified\":[\"invoice\"],\"note\":\"short\"}" > /dev/null
  AFTER=$(curl -s -H "$AUTH" "$API/exceptions?fcId=fc-bhiwandi" | jlen "")
  check "short GRN raised an exception" "$((BEFORE+1))" "$AFTER"
else
  echo "  (skipped GRN test — nothing in the receiving queue)"
fi

echo ""
echo "--- tenant isolation ---"
# Two vendors, two tokens, no overlap. This is the assertion that would have
# caught the unscoped listings: every one of them passed a single-tenant test,
# because a single tenant cannot tell a scoped feed from an unscoped one.
AUTH2="Authorization: Bearer $(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json'   -d '{"role":"dispatcher"}' | j "['token']")"

check "two tenants share no shipment" "True" "$(python3 -c "
import json,subprocess
def ids(auth, path):
    out=subprocess.run(['curl','-s','-H',auth,'$API'+path],capture_output=True,text=True).stdout
    return {r['id'] for r in json.loads(out)}
a=ids('$AUTH','/shipments/all'); b=ids('$AUTH2','/shipments/all')
print(len(a)>0 and len(b)>0 and not (a & b))")"

check "two tenants share no document" "True" "$(python3 -c "
import json,subprocess
def ids(auth, path):
    out=subprocess.run(['curl','-s','-H',auth,'$API'+path],capture_output=True,text=True).stdout
    return {r['id'] for r in json.loads(out)}
a=ids('$AUTH','/documents'); b=ids('$AUTH2','/documents')
print(len(a)>0 and len(b)>0 and not (a & b))")"

check "two tenants share no appointment" "True" "$(python3 -c "
import json,subprocess
def ids(auth, path):
    out=subprocess.run(['curl','-s','-H',auth,'$API'+path],capture_output=True,text=True).stdout
    return {r['id'] for r in json.loads(out)}
a=ids('$AUTH','/appointments'); b=ids('$AUTH2','/appointments')
print(len(a)>0 and len(b)>0 and not (a & b))")"

# --- and cannot WRITE to each other's consignments -------------------------
# Reads were scoped before writes were, which is the wrong way round: reading
# another tenant's data is bad, silently cancelling their delivery is worse.
# vendor-2 picks a shipment it cannot see and tries to mutate it anyway.
OTHER=$(curl -s -H "$AUTH" $API/shipments/all | python3 -c "
import sys,json
rows=json.load(sys.stdin)
open_ = [r for r in rows if r['status'] in ('created','docs_pending','in_transit')]
print((open_ or rows)[0]['id'])")

check "cannot advance another tenant's shipment" 404 "$(code -X POST $API/shipments/$OTHER/advance -H "$AUTH2"   -H 'Content-Type: application/json' -d '{"status":"at_gate","label":"x"}')"
check "cannot cancel another tenant's shipment" 404 "$(code -X POST $API/shipments/$OTHER/cancel -H "$AUTH2"   -H 'Content-Type: application/json' -d '{"reason":"x"}')"
check "cannot dock another tenant's shipment" 404 "$(code -X PATCH $API/shipments/$OTHER/dock -H "$AUTH2"   -H 'Content-Type: application/json' -d '{"dockId":"fc-bhiwandi-dock-1"}')"
check "cannot sign for another tenant's shipment" 404 "$(code -X POST $API/shipments/$OTHER/pod -H "$AUTH2"   -H 'Content-Type: application/json' -d '{"receiverName":"x","cartonsReceived":1,"photos":0}')"

# A malformed body must be 400, not 500 — a 500 here previously disguised a
# write attempt that never reached the ownership check.
check "malformed body is 400 not 500" 400 "$(code -X POST $API/shipments/$OTHER/pod -H "$AUTH2"   -H 'Content-Type: application/json' -d '{"receiverName":"x"}')"

# The live tick is a bulk endpoint taking ids in the body, which is how it
# escaped the write-path audit — that only probed /{id}/... routes. Unscoped it
# let any tenant stamp any consignment with an arrival time and a delay of their
# choosing, and returned applied:1.
check "live tick ignores another tenant's shipment" "0" "$(curl -s -X POST $API/shipments/live -H "$AUTH2"   -H 'Content-Type: application/json' -d "[{\"id\":\"$OTHER\",\"progress\":0.5,\"lat\":19.0,\"lng\":73.1,\"remainingKm\":10,\"speedKmph\":40,\"predictedAt\":99999999999999,\"delayMin\":999999,\"delayReason\":\"hijacked\"}]" | j "['applied']")"

# --- fulfilment centre site isolation --------------------------------------
# FC is cross-tenant by design — a desk sees every vendor booked into its site.
# That made it easy to miss that it is still bounded on the OTHER axis: one
# site. Every one of these read a different site's board until this was fixed,
# and gate-out on another site's vehicle returned 200.
echo "--- fulfilment centre site isolation ---"
FCAUTH="Authorization: Bearer $(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json'   -d '{"role":"fc"}' | j "['token']")"

check "own arrival board works" 200 "$(code $API/fc/fc-bhiwandi/arrivals -H "$FCAUTH")"
check "another site's arrival board is hidden" 404 "$(code $API/fc/fc-manesar/arrivals -H "$FCAUTH")"
check "another site's yard is hidden" 404 "$(code $API/fc/fc-manesar/yard -H "$FCAUTH")"
check "another site's receiving queue is hidden" 404 "$(code $API/fc/fc-manesar/receiving -H "$FCAUTH")"
check "another site's dock gantt is hidden" 404 "$(code $API/fc/fc-manesar/dock-schedule -H "$FCAUTH")"
check "another site's analytics are hidden" 404 "$(code $API/analytics/fc/fc-manesar -H "$FCAUTH")"

# Well-formed bodies. A malformed one is rejected before authorisation runs and
# proves nothing — which is exactly how this hole stayed hidden for a round.
OTHERSHIP=$(python3 -c "
import json,subprocess
out=subprocess.run(['curl','-s','-H','$AUTH','$API/shipments/all'],capture_output=True,text=True).stdout
rows=[r for r in json.loads(out) if r.get('fcId')!='fc-bhiwandi']
print(rows[0]['id'] if rows else '')")

if [ -n "$OTHERSHIP" ]; then
  check "cannot gate in another site's vehicle" 404 "$(code -X POST $API/fc/shipments/$OTHERSHIP/gate-in -H "$FCAUTH")"
  check "cannot gate out another site's vehicle" 404 "$(code -X POST $API/fc/shipments/$OTHERSHIP/gate-out -H "$FCAUTH")"
  check "cannot receipt another site's goods" 404 "$(code -X POST $API/fc/shipments/$OTHERSHIP/grn -H "$FCAUTH"     -H 'Content-Type: application/json'     -d '{"decision":"accepted","receivedCartons":1,"damagedCartons":0,"documentsVerified":["invoice"],"note":"x"}')"
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1

