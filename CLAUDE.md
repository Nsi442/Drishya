# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Drishya** — real-time transport visibility for vendors delivering into marketplace fulfilment
centres. One shipment object, three portals over it: the vendor who books it, the driver who
carries it, the fulfilment centre that receives it.

**Never name a real marketplace**, in code, copy, seed data or comments. The four sites are
generic: FC Bhiwandi, Manesar, Whitefield, Sanand.

## Repository shape

Two independent projects, no root build file. **Both paths contain characters that need quoting** —
a space in `Drishya Frontend`, a dot in `Drishya.Backend`. Quote them in every shell command.

```
Drishya.Backend/                     Spring Boot 4.1 · Java 21 · port 8080
Drishya Frontend/drishya_frontend/   React 19 · Vite · port 5173
docker-compose.yml                   PostgreSQL 16 + PostGIS
```

> The outer `Drishya Frontend/CLAUDE.md` is **stale** — it describes the app as a bare `create-vite`
> template with no routing or API integration, which stopped being true long ago. Trust the inner
> `Drishya Frontend/drishya_frontend/CLAUDE.md` instead.

> A `CLAUDE.md` in the **parent** directory (`../CLAUDE.md`) belongs to a *different* project — the
> Python/Node generator that builds the course reports and slide decks. It is loaded into context
> automatically and describes `scripts/build.py`, morphological charts and PPTX styling. None of
> that applies to this codebase. Its product framing does.

## Commands

```bash
# the whole system in one command: db + api + frontend
docker compose up --build       # web :5173 · api :8080

# or just the database, keeping hot reload on both apps
docker compose up -d db

# backend
cd Drishya.Backend
./mvnw spring-boot:run          # http://localhost:8080
./mvnw compile
./mvnw test
./mvnw test -Dtest=GeofenceSpatialTest          # one class (real PostGIS via Testcontainers)

# frontend — note the two-level path
cd "Drishya Frontend/drishya_frontend"
npm install && npm run dev      # http://localhost:5173
npm run build
npm run lint                    # no test runner is configured

# end-to-end check, both servers up. 68 assertions, safe to re-run.
bash Drishya.Backend/scripts/api-smoke-test.sh

# tenant isolation on the write paths — every line must say "blocked"
python Drishya.Backend/scripts/tenant-write-audit.py

# every page, in a real browser, as every role. Catches what curl cannot.
node Drishya.Backend/scripts/ui-smoke.mjs

# the real journeys, clicking what a person clicks: paperwork rejected then
# corrected, dispatch blocked then allowed, evidence pack downloaded, POD signed
node Drishya.Backend/scripts/ui-journeys.mjs
```

**Start the backend before the frontend.** Vite proxies `/api` to port 8080, so the browser stays
on one origin and CORS never enters into it in development.

**Demo accounts** — password `drishya` for all three; the login screen has one-click buttons.
`priya@anandauto.example` (vendor), `ramesh@fleet.example` (driver), `imran@fcbhiwandi.example` (FC).

### JAVA_HOME on this machine

`JAVA_HOME` is set to the 8.3 short path `C:/Progra~1/Java/jdk-23`, which Git Bash cannot resolve —
`mvnw` fails with "JAVA_HOME is not defined correctly". Either fix it permanently, or prefix:

```bash
JAVA_HOME="/c/Program Files/Java/jdk-23" ./mvnw compile
```

## Architecture

### The wire contract is the load-bearing thing

Every enum in `domain/enums/` carries an **explicit `@JsonValue` string** (`at_gate`, `low-battery`,
`docs_pending`). Those strings match the keys in the frontend's `src/lib/constants.js` **exactly**.

Renaming a Java constant is safe. **Changing a wire value breaks the browser silently** — a status
pill renders blank, a filter matches nothing, and no error is thrown at either end. Any change to
an enum's wire value is a two-file change, minimum.

### Timestamps cross the wire as epoch milliseconds

Not ISO strings. The frontend does date arithmetic on them and feeds them to `new Date(...)`.
Entities hold `Instant`; **`service/Mapper.java` is the only place that converts.** Nothing ever
hands an `Instant` to Jackson.

### Derived, never stored

Vendor scorecards (on-time %, doc accuracy, rejection rate), alerts and receiving exceptions are all
**computed from shipments on every read**. A stored percentage that can drift from the shipments it
claims to summarise is worse than not having one. Alerts point at real shipments, so clicking
through from the feed always lands somewhere coherent.

### `promisedAt` and `predictedAt` are both kept, deliberately

One is what was agreed at booking and never moves. The other is what the platform currently
believes. **The gap between them is the entire product.** Neither may overwrite the other.

### Backend layering

```
domain/     JPA entities; domain/enums holds the wire vocabulary
repo/       Spring Data repositories — tenant filtering belongs HERE, not in controllers
dto/        what goes over the wire; dto/request holds every request body
service/    business logic; Mapper is the entity-to-DTO seam
service/eta/        prediction: FeatureBuilder, EtaModel seam, schedulers
service/validation/ the ASN validator chain, one bean per rule
web/        REST controllers + one @RestControllerAdvice
config/     Spring Security chain, CORS, password hashing, async/scheduling
seed/       deterministic dataset — fixed seeds, same data every boot
```

### Frontend data flow — one direction, one choke point

Pages and components call `src/services/*` and **never `fetch` directly**. `services/client.js` is
the single place that knows the API is HTTP: base URL, bearer token, error mapping. There is no
mock layer; it was deleted when the API landed.

`services/referenceData.js` loads vendors, FCs, docks, vehicles and drivers **once** after sign-in
and exposes them **synchronously** — a select's options and a dock name inside a table cell cannot
wait on a promise. It is mutated in place, so modules that imported it at startup see the filled
version.

The store is Context + `useReducer` in four slices (`src/store/`). The bearer token is held **in
memory only**, never `localStorage`.

## Spring Boot 4 — traps this project has already hit

Boot 4.1 sits on Spring Framework 7, Jakarta EE 11, **Hibernate 7.4.1**, Jackson 3 and Spring
Security 7. It is not Boot 3 with a bumped version. Do not copy Boot 3 patterns from memory.

- **Let the parent BOM manage versions.** `hibernate-spatial` must move in lockstep with
  `hibernate-core` or the dialect fails to register PostGIS types. Never pin it by hand.
- **Testcontainers 2.0 renamed every module.** `org.testcontainers:postgresql` no longer exists —
  it is `testcontainers-postgresql`, and `junit-jupiter` is `testcontainers-junit-jupiter`. A Boot 3
  snippet fails with "version is missing", which names nothing useful.
- **JTS is not in the Boot BOM.** It arrives transitively via `hibernate-spatial`, which is what
  keeps it aligned. Do not add it explicitly.
- **Jackson 3** dropped `spring.jackson.serialization.write-dates-as-timestamps` entirely.
- **JDK 23 disabled implicit annotation processing.** Lombok on the classpath is no longer
  discovered — it silently generates nothing and every getter is "cannot find symbol". The
  `maven-compiler-plugin` block declaring `-proc:full` and an explicit `annotationProcessorPaths`
  is the supported fix. **Do not remove it.**
- **`@SpringBootTest` no longer auto-configures MockMvc** — add `@AutoConfigureMockMvc`.

## Persistence

**PostgreSQL 16 + PostGIS, schema managed by Flyway.** `ddl-auto` is off.

H2 was removed: it has no spatial support, and every geofence and lane query in this system runs in
PostGIS. `docker compose up -d db` replaces "nothing to install" with "one command".

- **Spatial work happens in PostGIS**, never hand-rolled Haversine in Java.
- **JTS geometry types never leave the entity layer.** Jackson 3 changed group IDs and class names
  and the JTS datatype module has no reliable Jackson 3 build. DTOs expose plain `lat`/`lon`
  doubles.
- **A spatial query that compiles proves nothing.** Hibernate 7 can emit different SQL than 6 for
  the same HQL. Verify against real PostGIS via Testcontainers, not H2.
- The local Postgres **major version is pinned to 16** to match the RDS deploy target. A query that
  works on 17 locally and fails on 16 in AWS surfaces the morning of a review.

### Reserved words

`SensorReading.value` and `Alert.read` are mapped to `reading_value` and `is_read`. Both are
reserved words; without the mapping the generated schema will not parse.

## Multi-tenancy

Data is **per-tenant for privacy, but lane-speed and dock-turnaround aggregates are shared across
tenants**. That pooling is the product's differentiator — prediction accuracy improves as the
cluster grows, and a single-vendor tracker structurally cannot do it. Preserve this property.

**Tenant isolation is enforced in the repository layer**, not by a controller remembering to filter.
`segment_speed_history` and `dock_turnaround_history` are the only two tables deliberately not
tenant-scoped.

**Every listing endpoint is scoped to the caller**, in the service, before the caller's own
filters run. A `vendorId` or `fcId` query parameter is something the browser *asks for*; it is
never the boundary. Each service has a `scopedFor(Caller)`/`visibleTo(row, Caller)` pair, and
they all fail closed on an unrecognised role. The pattern: vendor by tenant, FC by site, driver
by the shipments on their vehicle.

`docks`, `carriers`, `vehicles`, `drivers` and `fulfilment_centres` stay unscoped on purpose —
they are the shared cluster directory a vendor picks from when booking. `vendors` is **not** in
that set: a `VendorDto` carries on-time rate, document accuracy and rejection rate, so a vendor
sees only itself and only the receiving desk sees them all.

**FC is bounded on two axes, not one.** A receiving desk is deliberately cross-tenant — it must
see every vendor booked into its site — and that made it easy to forget it is still bounded to
*one site*. Every `/api/fc/{fcId}/*` route took the id straight from the path, so the desk at
Bhiwandi could read Manesar's arrival board, yard, receiving queue, dock gantt and analytics, and
gate a Manesar vehicle out (200). `FcService.requireSite` and `requireInbound` now derive the
site from the token and reject a mismatch with 404. When a role is cross-tenant, ask what else
bounds it.

**Writes are scoped too, at `ShipmentService.load(id, caller)`.** Reads were scoped first and
writes were missed entirely, which is the wrong way round — reading another tenant's data is
bad, silently cancelling their delivery is worse. Every write path goes through that one loader
so a method added later inherits the check instead of remembering to ask.
`scripts/tenant-write-audit.py` attempts the mutations as the wrong tenant; every line must say
blocked.

**`Input` already wraps `Field`.** Pass `label` and `hint` straight to `Input`; nesting the two
produces an outer `<label htmlFor>` pointing at an id no input has, so the field is unlabelled
for a screen reader and clicking the label focuses nothing. It renders perfectly, which is why
it survived a page-level render check and was only caught by a test trying to fill the form by
label.

**The arrival estimate has one owner: the ETA engine.** `POST /api/shipments/live` used to
accept a client-supplied `predictedAt` and `delayMin` and write them straight onto the shipment,
so the browser simulation and the engine were both authoring the same field with no arbiter —
which is how a consignment came to show "108 h late" from seeded timestamps days in the past.
The tick now reports position only. It was also a bulk endpoint taking ids in the body, so it
escaped a write-path audit that probed only `/{id}/...` routes, and let any tenant stamp any
consignment (`applied: 1`). **A bulk endpoint is still a write.**

**There are two map pages and they are easy to confuse.** `/vendor/live-map` ("Control tower")
is the original, driven by the browser-side simulation in `useLiveShipments`; `/vendor/trips`
("Live trips") is the newer one, drawn from ingested positions, real geofences and stored
predictions. Both were reported as "the live trips page not working" while the fault was only
ever in the first. They should be consolidated.

**Absent is not zero, in the UI as well as the API.** `formatTime`/`formatRelative` handed a
null to `new Date(null)` — epoch 0 — and rendered "ETA 05:30 am · 20695d ago" in the same
typeface as a real arrival. `DelayPill` defaulted a missing delay to 0 and displayed a confident
**"On time"** for a consignment the platform had lost track of, which is the reassuring answer in
the one case that warrants none. Both now render "no estimate".

**Seeded demo data must ask the engine, not guess.** `TripSeeder` books each slot from
`FeatureBuilder`'s own estimate. Two earlier versions estimated arrival independently — a flat
52 km/h, then per-segment defaults — and both disagreed with the engine, which costs each stretch
at hour-bucketed history and swings by a third across peak and night. On the 840 km lane the gap
reached nine hours and showed as "8 h 45 m late" against a slot the seeder had itself chosen.
**Demo data that argues with the engine reads as a broken engine.**

**A withdrawn estimate is a null, and callers must expect one.** `predictedAt` is legitimately
absent when the engine refuses to answer from a stale fix. `FcService.arrivals` dereferenced it
and 500'd. A consignment with no current estimate is still inbound and belongs on the board —
sorted last, not filtered out.

**Predictions have a shelf life.** `FeatureBuilder` refuses to build features from a fix older
than 2 hours, `TripService` reports `TRACKING_LOST` and suppresses the estimate and the lateness
figure, and `StaleTripJob` marks a trip ABANDONED after 24 silent hours. Without those, a trip
left running kept predicting "52 minutes from now" for four days and reported itself **85 hours
late** — every number arithmetically correct, the conclusion worthless. A system with no way to
say "I have lost this vehicle" will express ignorance in the language of precision, and absurd
output is how people learn to stop believing the screen.

**A 400 is not a "blocked".** A malformed body is rejected before authorisation runs, so it
proves nothing about whether the endpoint is protected. Two write paths looked unprotected for
exactly this reason, and two more looked protected when they were not. Always probe with a
well-formed body.

**Check inherited repositories before trusting them.** The tenancy work scoped the entities it
added (`Trip`, `Position`, `EtaPrediction`) but left the pre-existing ones alone, and
`AlertRepository.findAllByOrderByAtDesc()` was still being called from the listing endpoint —
so every authenticated caller received all 59 alerts across all 12 vendors. A full audit then
found the same hole in `shipments`, `shipments/all`, `documents`, `appointments`, `exceptions`,
`analytics/vendor/*` and `vendors` — every inherited listing endpoint. All are now scoped.

**Fail closed**, and prove it with two tenants. A single-tenant test cannot tell a scoped feed
from an unscoped one, which is exactly why this survived a green suite for so long.
`scripts/api-smoke-test.sh` now signs in as two vendors and asserts their shipments, documents
and appointments do not intersect.

## Position provenance

**Every position carries its `source`** (`SIMULATED` or `BROWSER`) and the two must stay
distinguishable in every API response — evidentiary weight differs, and the evidence pack is a
chargeback dispute artefact. Do not let them blend.

Hardware is out of scope. GPS is simulated. **No firmware, MQTT or raw socket code** — ingest is
HTTPS only.

## Security

**Spring Security 7 with real HS256 JWTs.** `config/SecurityConfig.java` declares the whole
filter chain; `config/AuthTokenFilter.java` is no longer authentication, only a bridge that
copies the JWT subject onto the request attribute the controllers read.

- Passwords are BCrypt hashed, never returned in a response.
- Tokens are issued by `AuthService` with the user id as subject and the role in a `roles`
  claim, and validated by the OAuth2 resource server.
- **Per-role authorisation is enforced.** Booking, dispatch and ASN submission are
  `VENDOR_ADMIN`/`DISPATCHER`; gate-in, gate-out and GRN are `FC`. This was the documented
  hole in the old hand-rolled filter, where any valid token reached any endpoint.
- Tenant isolation is still enforced in the **repository layer**, from the account looked up
  per request — never from the `tenant` claim, which is there for human inspection only.

Spring Security 7 has **no implicit behavior**. With the starter on the classpath and no
`SecurityFilterChain`, every endpoint sits behind a generated password and the API returns 401
to its own frontend. Unexplained 401s or 403s are almost always a rule missing from
`SecurityConfig`.

Two traps this project hit, both worth keeping in mind:
- `JwtGrantedAuthoritiesConverter` defaults to the `scope` claim with no prefix, which yields
  an authenticated principal holding **no authorities** — every `hasRole` fails while the token
  itself validates perfectly. The claim name and `ROLE_` prefix must be set explicitly.
- Spring MVC's `mvcHandlerMappingIntrospector` also implements `CorsConfigurationSource`, so
  injecting one into the filter chain is ambiguous and the context refuses to start. Qualify
  it by bean name.

Still missing, deliberately: no refresh token and no revocation list, so a leaked token is
valid until it expires (12 hours). `JWT_SECRET` must be set in any environment that restarts —
unset means a key generated per boot, which signs everyone out on every deploy.

### API documentation

springdoc **3.x** (Boot 4 tracks the major version; the 2.x releases in every tutorial are
Boot 3 only). Swagger UI at `/swagger-ui.html`, document at `/v3/api-docs`. Both are public;
the endpoints they describe are not.

## Constraints

Deploy target is a `t3.micro` with `db.t4g.micro` behind it. Keep `hikari.maximum-pool-size=5` and
the JVM footprint modest. **No load balancer, NAT gateway, multi-AZ RDS or read replica** — each is
billed hourly and none is needed. No Kafka, Kubernetes or service mesh. No paid APIs; maps are
OpenStreetMap tiles via Leaflet.

If a design step seems to require one of those, stop and say so rather than provisioning it.
