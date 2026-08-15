# Drishya — backend

REST API for Drishya: shipment visibility from a vendor's warehouse into a marketplace
fulfilment centre, shared by the vendor, the driver and the receiving desk.

Spring Boot 4.1 · Java 21 · Spring Data JPA · H2 (in memory by default).

## Running it

```bash
cd Drishya.Backend
./mvnw spring-boot:run
```

The API comes up on **http://localhost:8080** and seeds itself: 60 shipments, 12 vendors, 4
fulfilment centres, 31 docks, 25 vehicles, 20 drivers, plus the alerts, dock appointments and
receiving exceptions derived from them. Nothing to install and no fixtures to import.

Browse the data at **http://localhost:8080/h2-console** (JDBC URL `jdbc:h2:mem:drishya`, user
`sa`, no password).

### With the frontend

Start this first, then `npm run dev` in `../Drishya Frontend/drishya_frontend`. Vite proxies
`/api` here, so the browser only ever talks to one origin and CORS never comes into it.

### Demo accounts

Password is `drishya` for all three. The login screen has one-click buttons for them.

| Role | Email |
|---|---|
| Vendor | `priya@anandauto.example` |
| Driver | `ramesh@fleet.example` |
| Fulfilment centre | `imran@fcbhiwandi.example` |

### Checking it works

```bash
bash scripts/api-smoke-test.sh
```

59 assertions across auth, filtering, the wire format, dock conflicts, receiving and the write
paths. Safe to run repeatedly — it creates data, so it avoids asserting absolute counts and
books a fresh window each run.

## Layout

```
domain/       JPA entities; domain/enums holds the wire vocabulary
repo/         Spring Data repositories
dto/          what goes over the wire; dto/request holds every request body
service/      business logic — Mapper is the entity→DTO seam
web/          REST controllers and the error handler
config/       CORS, password hashing, the auth filter
seed/         the deterministic dataset
```

## Things worth knowing before you change something

**Enum wire values are the contract.** `domain/enums/*` each carry an explicit string — `at_gate`,
`low-battery` — matching the frontend's `src/lib/constants.js` exactly. Renaming a Java constant is
safe; changing a wire value breaks the browser.

**Timestamps go over the wire as epoch milliseconds, not ISO strings.** The frontend does date
arithmetic on them directly. Entities hold `Instant`; `Mapper` converts. Nothing hands an `Instant`
to Jackson.

**`promisedAt` and `predictedAt` are both kept, deliberately.** One is what was agreed at booking
and never moves; the other is what the platform now believes. The gap between them is the product.

**Two bookings cannot hold one bay.** Enforced in `AppointmentService`, not in the browser — the
vendor requesting a slot and the FC dragging one on the gantt are different people who cannot see
each other's screens. A clash returns **409**.

**Scorecards are computed, never stored.** On-time rate, document accuracy and rejection rate are
derived from shipments on every read. A stored percentage that can drift from the shipments it
claims to summarise is worse than none.

**Alerts and exceptions are derived from shipments.** A "delay predicted" alert points at a
shipment that is genuinely late. Generating them independently produces a demo that falls apart
the moment someone clicks through from the feed to the consignment.

## Two gotchas this project already hit

**JDK 23 disabled implicit annotation processing.** Lombok on the classpath is no longer discovered
automatically — it silently generates nothing and every getter comes back as "cannot find symbol".
The `maven-compiler-plugin` block in `pom.xml` declares the processor path and `-proc:full`
explicitly. Do not remove it.

**`value` and `read` are reserved words.** `SensorReading.value` and `Alert.read` are mapped to
`reading_value` and `is_read`; without that the generated schema will not parse on H2.

## Security — read this before deploying anything

Local-development grade, and deliberately scoped:

- Passwords are BCrypt hashed and never returned in a response.
- The bearer token is HMAC-signed with a key regenerated on every boot, so restarting invalidates
  every session. `AuthTokenFilter` verifies it on every `/api/**` call except the public auth paths.
- **There is no per-role authorisation.** Any valid token reaches any endpoint — a driver's token
  could call a vendor endpoint. The frontend separates roles in its router, which is a usability
  boundary, not a security one.
- There is no refresh, no revocation and no rate limiting.

Closing those gaps means Spring Security with method-level checks. `AuthTokenFilter` is the seam
where it goes.

## Persistence

H2 in memory by default — every restart rebuilds the seeded dataset. For data that survives:

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=postgres
```

That profile expects `drishya` on `localhost:5432`. The seeder does nothing when it finds existing
vendors, so it will not overwrite a database you have used. `ddl-auto` is `update` there; for
anything beyond local work, replace it with Flyway or Liquibase — Hibernate's schema generation is
not a migration tool.
