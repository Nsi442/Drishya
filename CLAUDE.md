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

**The browser never authors state. It polls.** `useLiveShipments` used to be a simulation:
each tab advanced its own copy of every moving consignment, recomputed its own ETA from its own
random walk, invented its own delays and door-opens through `pushAlert`, and posted the result
back over whatever the server had. Three people signed in meant three answers to "where is this
lorry", all confident, none of them the platform's — and an alert one of them saw did not exist
for the other two, because `pushAlert` only ever built an object in that tab. The hook now polls
`/shipments/all` and `/alerts` on the same interval and dispatches what comes back.
`commitLivePositions`, `recomputePosition`, `pushAlert` and `DELAY_REASONS` are gone with it.
**A client that can author a position is a client that can disagree with the platform about
where a lorry is.**

**The shipment row follows the trip, and that had to be built.** The server drove the trip —
`TripSimulationJob` moves the vehicle, ingest records the fix, the geofence reads it, the ETA
engine predicts against it — while `Shipment.position`, `progress` and `remainingKm` were written
by nothing on the server at all. Every table, map pin and progress bar outside `/vendor/trips`
reads the shipment, so the two accounts drifted apart by design. `ShipmentPositionListener`
projects the newest fix onto the consignment, and `EtaService` sets progress from the engine's
own `remainingDistanceM`. **Two representations of one lorry will diverge unless something
joins them.**

**Two listeners on one batch, on an unversioned row.** `GeofenceListener` sets the shipment's
status from a batch of fixes; `ShipmentPositionListener` sets where it is, from the same batch,
on the same pool. `Shipment` has no `@Version`, so two loaded copies each write the whole row and
the second to commit silently undoes the first — a gate-in reverted by a position from the same
batch. `ShipmentRepository.recordPosition` is a `@Modifying` update naming four columns for
exactly that reason, with the delivered/cancelled guard in the `WHERE` clause rather than read
first. **A targeted update cannot clobber a column it does not mention.**

**There are two map pages and they are easy to confuse.** `/vendor/live-map` ("Control tower")
is the original; `/vendor/trips` ("Live trips") is the newer one, drawn from ingested positions,
real geofences and stored predictions. Both were reported as "the live trips page not working"
while the fault was only ever in the first. They no longer contradict each other now the store
is server-fed, but they are still two pages over one dataset and should be consolidated.

**The platform says what it knows, an hour ahead.** Booking agrees a promised *slot* with the
vendor; it does not book a *dock*, which is the receiving desk's decision through the appointment
flow. Nothing asked for that decision — it relied on somebody watching the arrival board closely
enough. `ApproachingArrivalJob` raises `SLOT_REQUIRED` when a trip is inside
`drishya.arrival.notice-lead-min` of arriving with no settled appointment. It reads the engine's
stored prediction, never a client's arithmetic; it refuses a prediction older than
`FeatureBuilder.MAX_FIX_AGE`, because announcing an arrival from a fix nobody has seen in two
hours is `StaleTripJob`'s failure broadcast to a second party who will act on it; and
`trips.slot_request_notified_at` makes it once per journey rather than once per cycle.
**An estimate that changes nobody's decision is not worth computing.**

**It measures travel, not dock-in, and that distinction was found by running it.** The engine
predicts when a vehicle reaches a *bay* — travel plus the queue it expects in the yard. Keying
the notice on that was circular: the queue is long precisely because no dock is booked, so the
figure stayed above the hour while the vehicle drove the last stretch. On a real run, travel fell
90 → 68 → 45 → 23 → 1 minutes while the total never dropped below 93. Subtracting
`predictedQueueMinutes` leaves the thing both parties mean by "an hour away".

**The engine reasons in real time; the simulator does not.** `TripSimulationService` compresses
time by `timeScale`, but the ETA engine predicts real-world minutes from lane history (~34 km/h
on the seeded lanes). At `timeScale=10` a vehicle covers the last 50 km in four real minutes
while the engine still believes it is ninety minutes out, so an arrival notice keyed on predicted
time barely fires, or does not. Nothing is wrong with either component. For a demo that must show
the notice, either drive at a low `timeScale` or raise `ARRIVAL_NOTICE_LEAD_MIN` to match the
compression.

**An enum constrained in the schema is a THREE-file change.** The two-file rule above covers
the browser contract. It is not the whole contract: Hibernate persists these enums by NAME, and
`alerts.type`, `positions.source` and `shipments.route_source` each carry a CHECK constraint
listing the names the table accepts. Adding `AlertType.SLOT_REQUIRED` to the Java enum and to
`constants.js` compiled, started, and passed every test — then failed at the moment the feature
first did its job, because `alerts_type_check` had never heard of it. Java enum, frontend
vocabulary, **and a migration.**

**A try/catch inside `@Transactional` is not error handling.** `ApproachingArrivalJob` looped
over every active trip with `@Transactional` on the method and a catch per trip, which reads as
"one bad trip must not stop the others" and did the opposite: the first failed insert marked the
transaction rollback-only, every later trip died with "current transaction is aborted", and the
swallowed exceptions let the job log that it had **notified the receiving desk when it had
notified nobody** — the counted row was rolled back with the rest. A per-item boundary
(`TransactionTemplate`, as `RouteBackfillService` uses) is what makes the catch mean what it
says. Re-read the entity inside its own transaction: the one from the listing is detached, and
writing to it updates nothing.

**Splitting a `@Transactional` method leaves the annotation behind.** Adding a `withRoute`
overload to `ShipmentService.listAll` moved the body to a new arity and left
`@Transactional(readOnly = true)` on the old one. Both are called directly by the controller, and
Spring's advice lives in a proxy an in-class call never crosses — so the new method ran with no
session and `Mapper` threw `LazyInitializationException` on its first lazy hop
(`vehicle.getCarrier()`), turning the endpoint every portal polls into a 500. It compiled, and
nothing short of calling the endpoint would have found it. **Annotate every arity that is an
entry point.**

**The poll asks for everything that changes and nothing that cannot.** A route is fixed at
booking and, once it is a real road, several hundred points — most of the response. Measured on
the receiving desk's feed with real routes: 102.6 KB a poll with them, 20.3 KB without.
`/api/shipments/all?withRoute=false` omits them, `SHIPMENTS_SYNC` carries the held route forward,
and an empty route on the wire means "unchanged, you already have it" rather than "no route".
A consignment genuinely new to the client has nothing held, so the hook does one full read to
recover the missing polylines — which is why the poll must not run before `useShipmentStore`'s
first load lands: with an empty store every row looks new and the recovery fetches the whole set
a second time on every sign-in.

**`vite preview` does not inherit `server.proxy`.** Without `preview.proxy` the production build
cannot reach the API and every page loads empty, which reads as an application fault. It matters
because `preview` is the only way to see the build the deploy ships: `dev` runs React in
StrictMode, which double-invokes every effect and so doubles any request count measured there.

**The router client asks for uncompressed replies, deliberately.** Left alone, Spring's
`RestClient` advertises `Accept-Encoding: gzip` and the public router's proxy obliges — and the
reply then failed to inflate with `ZipException: incorrect header check`, wrapped as a bare
`RestClientException`. Every booking on the deployed site fell back to a drawn curve while the
same container could fetch the same URL with curl in 0.5s, and a gzipped reply decodes correctly
against a local stub, so the fault is in how the layers hand the encoding along rather than in
gzip. Reproduced since, with a stub that claims gzip and sends plain JSON: the inflation happens
**inside the HTTP client, while the body is still being read** — before any message converter and
before anything `RoutePlanner` could inspect — so a reply that lies about its encoding cannot be
rescued, only avoided. Sniffing the body's magic bytes was tried and removed: the stream fails
upstream of any point where it could look. `Accept-Encoding: identity` is the only lever at this
layer, and a route is tens of kilobytes fetched once per booking, so nothing is lost by it.
**A fallback that is meant to be invisible needs a log line that is not.** The first version
logged only `e.getClass().getSimpleName()` and that cost the diagnosis outright.

**A `??` fallback on a field that does not exist reads as data.** `Receiving.jsx` rendered
`row.dockName ?? 'No dock'`, and `ShipmentDto` has never carried a `dockName` — it carries
`dockId`. So every consignment in the receiving queue said "No dock", including the four standing
on a numbered bay, and the screen looked like a working page reporting an empty yard rather than
a broken one. Every other screen derives the name (`ArrivalBoard` inline, `InboundDetail` inline,
`YardVehicleDto` from the backend) and `referenceData.dockName(dockId)` exists for exactly this.
**A default that is indistinguishable from a real answer will hide the bug that produces it** —
the same fault as `DelayPill` defaulting a missing delay to a confident "On time".

**A route is chosen once, so routing needs something that comes back.** `RoutePlanner` decides at
booking and never revisits, which is right for a road but means the decision inherits whatever the
router was doing in that one second — unreachable for a moment, and that consignment is a straight
line for life. On the deployed site the router had been mislabelling its encoding for a week, so
every booking fell back and the map was twenty-three straight lines with nothing to say why. The
cure existed as `RouteBackfillService`, but only behind an endpoint someone had to know about and
a service token that was not set. **A repair that requires an operator to notice is not a repair.**
`RouteBackfillJob` runs the same work on a timer, five every ten minutes, until nothing is drawn;
unproductive cycles back off by doubling to a ceiling so a dead router stays cheap, and one
success clears it. Verified against real PostGIS and a stub router: 60 synthetic to 0 unattended,
then 2 attempts across 9 cycles once the router died, then recovery within one cycle of its return.

**One free router with no SLA is the fragility, so there are two.** `RoutingBackend` is an
interface and `RoutePlanner` walks a chain: OSRM first (where the load already sits and what the
lane distances were measured against), then BRouter, then the drawn curve. They must be
independent to be worth having — `router.project-osrm.org` resolves to `routing.openstreetmap.de`,
so a second OSRM mirror would have gone down with the first; BRouter is a different operator
running different software, and free and keyless, which keeps it inside the no-paid-APIs rule.
Blank `ROUTING_BROUTER_URL` to switch the fallback off without switching routing off. Plausibility
and endpoint-pinning live in the planner rather than each backend, so a third cannot be added
without them.

**`RestClient.uri(String)` encodes its argument again.** BRouter separates coordinate pairs with a
`|`, which is not a legal URI character, so it must be percent-encoded — and a pre-encoded `%7C`
passed as a String became `%257C`, which the far end decoded to the literal text `%7C` and could
not split. The symptom was a router closing the connection: "header parser received no bytes",
naming nothing. Build a `URI` with `UriComponentsBuilder` and pass that; a URI is sent through
untouched. **Note also that Spring strips the query string from its I/O error messages**, so a URL
in a log looking bare is not evidence the query was lost.

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
