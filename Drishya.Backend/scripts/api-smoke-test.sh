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
  -d '{"role":"vendor"}' | j "['token']")
checkne "demo-login returns a token" "$TOKEN"
AUTH="Authorization: Bearer $TOKEN"

ROLE=$(curl -s -X POST $API/auth/demo-login -H 'Content-Type: application/json' \
  -d '{"role":"fc"}' | j "['user']['role']")
check "demo-login honours the role" "fc" "$ROLE"

check "bad credentials rejected" 401 "$(code -X POST $API/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"wrong"}')"

LOGIN_ROLE=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya@anandauto.example","password":"drishya"}' | j "['user']['role']")
check "real login works" "vendor" "$LOGIN_ROLE"

HASPW=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"priya@anandauto.example","password":"drishya"}' | grep -c password)
check "password never returned" 0 "$HASPW"

check "garbage token rejected" 401 "$(code -H 'Authorization: Bearer nonsense' $API/shipments)"

echo "--- reference data ---"
check "fulfilment centres" 4 "$(curl -s -H "$AUTH" $API/fulfilment-centres | jlen "")"
check "vendors" 12 "$(curl -s -H "$AUTH" $API/vendors | jlen "")"
check "vehicles" 25 "$(curl -s -H "$AUTH" $API/vehicles | jlen "")"
check "drivers" 20 "$(curl -s -H "$AUTH" $API/drivers | jlen "")"
check "carriers" 5 "$(curl -s -H "$AUTH" $API/carriers | jlen "")"
check "docks" 31 "$(curl -s -H "$AUTH" $API/docks | jlen "")"

echo "--- shipments ---"
check "at least the 60 seeded shipments" "True" "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | python3 -c "import sys,json;print(json.load(sys.stdin)['total']>=60)")"
check "page size honoured" 25 "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | jlen "['rows']")"
check "page count is consistent with the total" "True" "$(curl -s -H "$AUTH" "$API/shipments?pageSize=25" | python3 -c "
import sys,json,math
d=json.load(sys.stdin)
print(d['pageCount']==max(1,math.ceil(d['total']/d['pageSize'])))")"
check "status filter" "delivered" "$(curl -s -H "$AUTH" "$API/shipments?status=delivered" | j "['rows'][0]['status']")"
check "listAll returns every shipment" "True" "$(curl -s -H "$AUTH" $API/shipments/all | python3 -c "import sys,json;print(len(json.load(sys.stdin))>=60)")"
check "unknown shipment 404s" 404 "$(code -H "$AUTH" $API/shipments/SHP-99999)"

SID=$(curl -s -H "$AUTH" "$API/shipments?pageSize=1" | j "['rows'][0]['id']")
checkne "got a shipment id" "$SID"

DETAIL=$(curl -s -H "$AUTH" $API/shipments/$SID)
checkne "detail has events" "$(echo "$DETAIL" | j "['events'][0]['stage']")"
check "detail has 5 documents" 5 "$(echo "$DETAIL" | jlen "['documents']")"
checkne "detail has route" "$(echo "$DETAIL" | j "['route'][0]['lat']")"
checkne "detail has position" "$(echo "$DETAIL" | j "['position']['lat']")"
checkne "detail has lane" "$(echo "$DETAIL" | j "['lane']")"
check "temperature series present" 24 "$(echo "$DETAIL" | jlen "['sensors']['temperature']")"

echo "--- wire format (the contract with the browser) ---"
TS=$(echo "$DETAIL" | j "['promisedAt']")
check "promisedAt is a number not a string" "True" "$(echo "$DETAIL" | python3 -c "import sys,json;print(isinstance(json.load(sys.stdin)['promisedAt'],int))")"
check "timestamp is epoch millis (13 digits)" 13 "${#TS}"
check "status is snake_case wire value" "True" "$(echo "$DETAIL" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'] in ['booked','picked_up','in_transit','at_gate','unloading','delivered','cancelled'])")"
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
checkne "arrival board" "$(curl -s -H "$AUTH" "$API/fc/fc-bhiwandi/arrivals?window=active" | jlen "")"
check "arrivals sorted by ETA" "True" "$(curl -s -H "$AUTH" "$API/fc/fc-bhiwandi/arrivals?window=active" | python3 -c "
import sys,json
d=[s['predictedAt'] for s in json.load(sys.stdin)]
print(d==sorted(d))")"
checkne "yard view" "$(curl -s -H "$AUTH" $API/fc/fc-bhiwandi/yard | jlen "['onSite']")"
checkne "dock schedule" "$(curl -s -H "$AUTH" $API/fc/fc-bhiwandi/dock-schedule | jlen "['docks']")"

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
check "created shipment is booked" "booked" "$(echo "$NEW" | j "['status']")"
check "created shipment has a route" "True" "$(echo "$NEW" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['route'])>=2)")"

check "over-capacity load refused" 400 "$(code -X POST $API/shipments -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"vendorId\":\"vendor-1\",\"fcId\":\"fc-bhiwandi\",\"vehicleId\":\"vehicle-1\",\"driverId\":\"driver-2\",
  \"commodity\":\"Footwear\",\"cartons\":100,\"weightKg\":999999,\"valueInr\":50000}")"
check "validation rejects empty commodity" 400 "$(code -X POST $API/shipments -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"vendorId\":\"vendor-1\",\"fcId\":\"fc-bhiwandi\",\"vehicleId\":\"vehicle-5\",\"driverId\":\"driver-2\",
  \"commodity\":\"\",\"cartons\":0,\"weightKg\":900,\"valueInr\":50000}")"

check "advance to picked_up" "picked_up" "$(curl -s -X POST $API/shipments/$NEWID/advance -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"picked_up","label":"Picked up"}' | j "['status']")"
check "cannot move backwards" 400 "$(code -X POST $API/shipments/$NEWID/advance -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"status":"booked"}')"

POD=$(curl -s -X POST $API/shipments/$NEWID/pod -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"receiverName":"Test Receiver","cartonsReceived":98,"photos":2}')
check "pod completes the shipment" "delivered" "$(echo "$POD" | j "['status']")"
check "pod recorded" "Test Receiver" "$(echo "$POD" | j "['pod']['receiverName']")"
check "over-count pod refused" 400 "$(code -X POST $API/shipments/$NEWID/pod -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"receiverName":"X","cartonsReceived":99999,"photos":1}')"

echo "--- goods receipt raises an exception ---"
BEFORE=$(curl -s -H "$AUTH" "$API/exceptions?fcId=fc-bhiwandi" | jlen "")
UNL=$(curl -s -H "$AUTH" $API/fc/fc-bhiwandi/receiving | j "[0]['id']")
if [ -n "$UNL" ] && [ "$UNL" != "null" ]; then
  CART=$(curl -s -H "$AUTH" $API/shipments/$UNL | j "['cartons']")
  curl -s -X POST $API/fc/shipments/$UNL/grn -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"decision\":\"partial\",\"receivedCartons\":$((CART-5)),\"damagedCartons\":2,\"documentsVerified\":[\"invoice\"],\"note\":\"short\"}" > /dev/null
  AFTER=$(curl -s -H "$AUTH" "$API/exceptions?fcId=fc-bhiwandi" | jlen "")
  check "short GRN raised an exception" "$((BEFORE+1))" "$AFTER"
else
  echo "  (skipped GRN test — nothing in the receiving queue)"
fi

echo ""
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
