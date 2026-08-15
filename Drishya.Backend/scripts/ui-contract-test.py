"""Replays exactly what the browser does after sign-in, through the Vite proxy,
and checks every field the UI actually reads. Catches the class of bug where the
API is 'working' but a component would render undefined."""
import json, urllib.request, sys

BASE = 'http://localhost:5173/api'
token = None
ok = fail = 0

def call(path, method='GET', body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data) as r:
        return json.loads(r.read().decode())

def check(name, cond, detail=''):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print('  FAIL  %s%s' % (name, (' — ' + str(detail)) if detail else ''))

def fields(name, obj, required):
    """Every listed field must be present and not None."""
    missing = [f for f in required if obj.get(f) is None]
    check(name, not missing, 'missing/null: ' + ', '.join(missing) if missing else '')

print('--- 1. sign in (what the login screen does) ---')
auth = call('/auth/demo-login', 'POST', {'role': 'vendor'})
token = auth['token']
fields('user object', auth['user'], ['id', 'email', 'name', 'role', 'orgId', 'orgName', 'initials'])
check('no password leaked', 'password' not in json.dumps(auth))

print('--- 2. reference data (loaded once after sign-in) ---')
vendors = call('/vendors'); centres = call('/fulfilment-centres'); docks = call('/docks')
vehicles = call('/vehicles'); drivers = call('/drivers'); carriers = call('/carriers')
check('vendors', len(vendors) == 12, len(vendors))
check('fulfilment centres', len(centres) == 4, len(centres))
check('docks', len(docks) == 31, len(docks))
check('vehicles', len(vehicles) == 25, len(vehicles))
check('drivers', len(drivers) == 20, len(drivers))
check('carriers', len(carriers) == 5, len(carriers))
fields('vendor row (scorecard table)', vendors[0],
       ['id', 'name', 'city', 'lat', 'lng', 'onTimePct', 'docAccuracyPct', 'rejectionRatePct'])
fields('FC row (filter selects)', centres[0], ['id', 'name', 'city', 'lat', 'lng', 'docks'])
fields('dock row (scheduler rows)', docks[0], ['id', 'fcId', 'name', 'type', 'maxVehicleLengthFt'])
fields('vehicle row (carriers page)', vehicles[0],
       ['id', 'regNumber', 'type', 'carrier', 'deviceStatus', 'capacityKg'])
fields('driver row (roster)', drivers[0],
       ['id', 'name', 'phone', 'licenceExpiry', 'rating', 'tripsCompleted', 'vehicleReg'])
check('carrier has computed on-time', isinstance(carriers[0].get('onTimePct'), int))

print('--- 3. shipment list (the store, and every table) ---')
allships = call('/shipments/all')
check('shipment set loaded', len(allships) >= 60, len(allships))
s = allships[0]
fields('shipment row', s, ['id', 'vendorName', 'fcName', 'status', 'lane', 'vehicleReg',
                           'driverName', 'promisedAt', 'predictedAt', 'cartons', 'distanceKm',
                           'position', 'route', 'origin', 'destination'])
check('position has lat/lng', 'lat' in s['position'] and 'lng' in s['position'])
check('route is a polyline', isinstance(s['route'], list) and len(s['route']) >= 2, len(s['route']))
check('origin is named', bool(s['origin'].get('name')))
check('lane reads "A → B"', '→' in s['lane'], s['lane'])
check('delayMin present (DelayPill)', isinstance(s.get('delayMin'), int))

print('--- 4. wire format (what would break silently) ---')
check('promisedAt is a number', isinstance(s['promisedAt'], int), type(s['promisedAt']).__name__)
check('epoch millis not seconds', len(str(s['promisedAt'])) == 13, s['promisedAt'])
statuses = {x['status'] for x in allships}
valid = {'booked', 'picked_up', 'in_transit', 'at_gate', 'unloading', 'delivered', 'cancelled'}
check('all statuses are known wire values', statuses <= valid, statuses - valid)
check('every lifecycle state present', len(statuses) >= 6, sorted(statuses))
check('low-battery keeps its hyphen',
      any(v['deviceStatus'] == 'low-battery' for v in vehicles))
check('priority is a wire value', {x['priority'] for x in allships} <= {'normal', 'high'})

print('--- 5. shipment detail (the most complex screen) ---')
d = call('/shipments/' + s['id'])
check('events present', len(d['events']) >= 1, len(d['events']))
fields('event', d['events'][0], ['stage', 'label', 'at'])
check('5 documents', len(d['documents']) == 5, len(d['documents']))
fields('document', d['documents'][0], ['id', 'type', 'status'])
check('sensors grouped by series', set(d['sensors']) == {'temperature', 'humidity', 'shock', 'door'},
      set(d['sensors']))
check('temperature series has points', len(d['sensors']['temperature']) == 24,
      len(d['sensors']['temperature']))
check('reading uses t/value (chart axes)',
      't' in d['sensors']['temperature'][0] and 'value' in d['sensors']['temperature'][0])

delivered = next((x for x in allships if x['status'] == 'delivered'), None)
if delivered:
    dd = call('/shipments/' + delivered['id'])
    check('delivered has POD', dd.get('pod') is not None)
    if dd.get('pod'):
        fields('POD', dd['pod'], ['receiverName', 'receivedAt', 'cartonsReceived'])
    check('delivered has GRN', dd.get('grn') is not None)

print('--- 6. the dashboards ---')
summary = call('/analytics/vendor/summary')
fields('vendor summary (KPI row)', summary,
       ['activeShipments', 'inTransit', 'delayed', 'onTimePct'])
check('at-risk list present', isinstance(summary.get('atRisk'), list))
check('on-time is a percentage', 0 <= summary['onTimePct'] <= 100, summary['onTimePct'])

weekly = call('/analytics/vendor/weekly')
check('weekly is 14 days', len(weekly) == 14, len(weekly))
fields('weekly point (stacked bars)', weekly[0], ['date', 'label'])
check('weekly has onTime/late keys', 'onTime' in weekly[0] and 'late' in weekly[0])

va = call('/analytics/vendor')
check('lanes computed', len(va['lanes']) > 0)
fields('lane row', va['lanes'][0], ['lane', 'shipments', 'onTimePct', 'avgCost'])
check('trend points', len(va['trend']) > 0)
fields('totals', va['totals'], ['shipments', 'delivered', 'onTimePct', 'avgCost'])

fc = call('/analytics/fc/fc-bhiwandi')
check('heatmap is 6 days x 16 hours', len(fc['heatmap']) == 96, len(fc['heatmap']))
fields('heat cell', fc['heatmap'][0], ['day', 'hour'])
check('fc volume 14 days', len(fc['volume']) == 14)
check('volume exposes shipments key', 'shipments' in fc['volume'][0], list(fc['volume'][0]))

fcsum = call('/analytics/fc/fc-bhiwandi/summary')
fields('fc summary', fcsum, ['inboundToday', 'docksTotal'])

print('--- 7. fulfilment centre screens ---')
arrivals = call('/fc/fc-bhiwandi/arrivals?window=active')
check('arrival board returns rows', len(arrivals) > 0, len(arrivals))
etas = [a['predictedAt'] for a in arrivals]
check('sorted by live ETA', etas == sorted(etas))
yard = call('/fc/fc-bhiwandi/yard')
check('yard has onSite + log', 'onSite' in yard and 'log' in yard)
if yard['onSite']:
    fields('yard vehicle (detention clock)', yard['onSite'][0],
           ['shipmentId', 'vehicleReg', 'minutesOnSite', 'detention'])
    check('detention band is ok/amber/red',
          yard['onSite'][0]['detention'] in ('ok', 'amber', 'red'))
sched = call('/fc/fc-bhiwandi/dock-schedule')
check('dock schedule has docks', len(sched['docks']) == 8, len(sched['docks']))
check('dock schedule has utilisation', len(sched['utilisation']) == len(sched['docks']))
check('dayStart present (gantt origin)', isinstance(sched.get('dayStart'), int))

print('--- 8. alerts, exceptions, documents, appointments ---')
alerts = call('/alerts')
check('alerts returned', len(alerts) > 0, len(alerts))
fields('alert', alerts[0], ['id', 'type', 'severity', 'title', 'message', 'at'])
excs = call('/exceptions?fcId=fc-bhiwandi')
check('exceptions returned', len(excs) > 0, len(excs))
fields('exception', excs[0], ['id', 'type', 'title', 'detail', 'status', 'severity', 'raisedAt'])
docs = call('/documents')
check('documents returned', len(docs) > 0, len(docs))
fields('document row', docs[0], ['id', 'shipmentId', 'type', 'status', 'lane', 'fcName'])
appts = call('/appointments?fcId=fc-bhiwandi')
check('appointments returned', len(appts) > 0, len(appts))
fields('appointment (calendar block)', appts[0], ['id', 'start', 'end', 'status', 'dockId', 'vendorName'])

print('--- 9. driver app ---')
dauth = call('/auth/demo-login', 'POST', {'role': 'driver'})
check('driver account links to a driver record', dauth['user'].get('driverId') is not None,
      dauth['user'].get('driverId'))
did = dauth['user']['driverId']
trips = call('/drivers/%s/trips' % did)
check('driver has trips today', len(trips) > 0, len(trips))
hist = call('/drivers/%s/history' % did)
check('driver history is a list', isinstance(hist, list))

print()
print('%d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
