# Tenancy review — findings

Reviewed 2026-09-02 against a locally seeded twelve-vendor database. Every item
below was **executed**, not inferred from reading, and each write was confirmed
by querying the affected row afterwards. Nothing here is theoretical.

Deliberately not recorded: the deployment's hostname, working request bodies,
and the demo credentials. The defects are visible in the source of this public
repository anyway; a ready-made recipe against a running instance is not.

---

## The defect

Eleven endpoints take a resource id from the path, or an owner id from the body,
and act on it without ever asking who is calling.

This project already knows the shape of this bug. `CLAUDE.md` records the same
class being found and fixed twice — first on the inherited listing endpoints,
then on the bulk `POST /api/shipments/live` — and states the rule that came out
of it:

> Every listing endpoint is scoped to the caller, in the service, before the
> caller's own filters run. A `vendorId` or `fcId` query parameter is something
> the browser *asks for*; it is never the boundary.

These endpoints were never brought under that rule.

## Reads

`GET /api/drivers` is unscoped on purpose — it is part of the shared cluster
directory a vendor picks from when booking. That is correct, and it is also the
enumeration list. Feed those ids to either endpoint below and the shipments come
back regardless of who owns them:

| Endpoint | Returns |
| --- | --- |
| `GET /api/drivers/{id}/trips` | Full `ShipmentDto` for every active consignment on that driver |
| `GET /api/drivers/{id}/history` | The same for delivered ones |

`ShipmentService.driverTrips` and `driverHistory` take a `driverId` and no
caller. `FleetController` passes the path variable straight through.

Measured: an account entitled to **5** consignments read **33** belonging to
**11** other vendors, including commodity, carton count, weight, declared value
in rupees, invoice number and e-way bill number. For a product whose premise is
per-tenant privacy, that is the whole premise.

## Writes

Each was performed as one vendor against another vendor's row, and each row was
then read back from the database to confirm the change persisted.

| Endpoint | Confirmed effect on another tenant's data |
| --- | --- |
| `POST /api/documents/{id}/reupload` | Document number overwritten |
| `PATCH /api/exceptions/{id}` | Receiving exception resolved, with the caller's note stored |
| `PATCH /api/appointments/{id}/decision` | Appointment confirmed |
| `PATCH /api/appointments/{id}/reschedule` | Dock slot moved |
| `POST /api/appointments` | Slot booked in another vendor's name (`vendorId` taken from the body) |
| `POST /api/shipments` | Consignment booked in another vendor's name (`vendorId` taken from the body) |
| `POST /api/alerts/read` | Alert marked read |
| `POST /api/alerts/{id}/acknowledge` | Alert acknowledged |
| `POST /api/documents/{id}/validate` | Document validated |
| `PATCH /api/drivers/{id}/availability` | Driver marked unavailable |

`PATCH /api/drivers/{id}/availability` is the one argued either way: drivers are
shared directory data. It still lets any tenant take a vehicle's driver off the
road for everyone.

### Two of these looked protected and were not

`PATCH /api/appointments/{id}/decision` and `/reschedule` first answered **400**.
That is a malformed body being rejected before authorisation runs, and it proves
nothing. With well-formed bodies both returned 200 and changed the row. This is
the trap `CLAUDE.md` already names:

> A 400 is not a "blocked". A malformed body is rejected before authorisation
> runs, so it proves nothing about whether the endpoint is protected. Always
> probe with a well-formed body.

## Why the existing audit passed

`scripts/tenant-write-audit.py` probes `/api/shipments/{id}/…` and
`/api/v1/trips/from-shipment/{id}`. Alerts, documents, appointments, exceptions
and drivers are never probed, so every line of its output says "blocked" and
every line is true. The script's own comment at line 59 anticipates exactly this
gap for a different case.

An audit that lists the routes it knows about will keep passing as routes are
added. Enumerating handler methods and asserting each takes a caller would fail
closed instead.

## What a fix looks like

The pattern already exists in this codebase. `ShipmentService.load(id, caller)`
is the single loader every shipment write goes through, so a method added later
inherits the check rather than having to remember it. `FcService.requireSite`
does the same for the receiving desk. These endpoints need the equivalent:

- Reads and writes addressed by id resolve through a loader that takes the
  caller and reports another tenant's row as **absent**, not forbidden.
- An owner id in a request body is never trusted. `POST /api/shipments` and
  `POST /api/appointments` should take the vendor from the authenticated
  account and reject — or ignore — a `vendorId` that disagrees.
- `tenant-write-audit.py` grows a case per endpoint family above, each with a
  well-formed body.

## Checked and found sound

Recorded so the next review does not repeat the work:

- **Wire contract.** All twenty enums carrying `@JsonValue`. Nineteen values do
  not appear in the frontend's `constants.js`; each was traced, and all are
  backend-only — `TripEventType`, `TripStatus.planned`/`abandoned`, `DayType`,
  `DockType`, `SensorKind.humidity`. None is rendered, so none renders blank.
- **Position provenance in `TripMap`.** The ternary defaults a null source to
  "simulated", which would assert provenance for a fix that does not exist —
  but markers are drawn from `positioned`, which filters to trips holding a
  position, and a position always carries its source. Unreachable.
- **`/api/v1/internal/**`.** `permitAll` in the filter chain, and correctly 404s
  both with no token and with a wrong one. The service-token check is real.
- **Frontend lint.** Clean.
- **`GET /api/v1/metrics/eta-accuracy`.** Cross-tenant, and reads as the
  deliberate pooling that `segment_speed_history` and `dock_turnaround_history`
  exist for rather than a leak.

## Not covered

- The React application beyond lint and the provenance path above.
- The ETA engine's numerical behaviour.
- Anything requiring more than one tenant and one FC desk to exercise.
- **Test coverage.** `GeofenceSpatialTest` is the entire backend suite against
  15,720 lines of Java. A single-tenant test cannot tell a scoped feed from an
  unscoped one, which is why the findings above survived a green suite —
  `CLAUDE.md` makes this point and `api-smoke-test.sh` acts on it for shipments,
  documents and appointments. No test covers the endpoints listed here.

## Status

Reported, not fixed. Left open by decision — this is a demonstration deployment
with three known accounts, seeded data and no real vendors, running for a few
weeks. Fix before anything real is booked through it, and do not treat the
per-tenant separation as load-bearing until then.
