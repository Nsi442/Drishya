# Drishya — frontend

**दृश्य** — *that which is seen.* Real-time visibility for shipments moving from a vendor's
warehouse into a marketplace fulfilment centre.

Three parties, one live shipment record, one login:

- **Vendor** — dispatches goods; needs to know where every consignment is, when it will
  *actually* arrive, and whether the paperwork will clear at the gate.
- **Driver** — carries the shipment on a phone, on patchy signal; needs today's trips,
  navigation, and a way to capture proof of delivery that survives a dead spot.
- **Fulfilment centre** — receives goods; needs an accurate inbound arrival board, dock slots
  that reflect reality, and a way to flag exceptions at receiving.

## Running it

The frontend talks to the Spring Boot API in `../../Drishya.Backend`, so start that first:

```bash
cd ../Drishya.Backend && ./mvnw spring-boot:run     # http://localhost:8080
```

then, in another terminal:

```bash
cd drishya_frontend
npm install
npm run dev
```

Vite proxies `/api` to port 8080 (see `vite.config.js`), so the browser only ever talks to one
origin and CORS never comes into it. Point `VITE_API_BASE` at a deployed API to override.

Then open the printed URL and use one of the three **demo login** buttons — no typing required.
Every screen in the product is reachable from there. Password for all three accounts is
`drishya`.

| Role | Email |
|---|---|
| Vendor | `priya@anandauto.example` |
| Driver | `ramesh@fleet.example` |
| Fulfilment centre | `imran@fcbhiwandi.example` |

Other commands: `npm run build`, `npm run preview`, `npm run lint`.

## What to look at first

- **`/vendor`** — the dashboard. Watch the KPI row and the at-risk list; they move on their own.
- **`/vendor/shipments/:id`** — the most detailed screen: live map, promised-vs-predicted ETA
  with a reason for the gap, event timeline, sensor traces, document status, POD.
- **`/vendor/live-map`** — control tower. Clustered markers, side panel synced to the map.
- **`/fc/inbound`** — the arrival board, sorted by live ETA with colour-coded variance.
- **`/fc/docks`** — drag an appointment block to another bay or hour; clashes hatch red.
- **`/driver`** (narrow the window to ~390px) — today's trips, then walk a trip through
  checklist → status advance → proof of delivery. Hit **Simulate offline** in the status bar
  first and watch the capture queue instead of failing.

Press <kbd>⌘K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to jump to a shipment, vehicle,
vendor or page, and <kbd>?</kbd> for the shortcut sheet.

## Where the data comes from

Everything is served by the Spring Boot API. `src/services/` is the only code that talks to it;
pages and components go through those functions and never call `fetch` themselves. The former
mock layer has been deleted.

Reference data that many screens need synchronously — vendors, fulfilment centres, docks,
vehicles, drivers — is fetched once after sign-in and cached in `src/services/referenceData.js`.

What is still simulated in the browser: the **live tick**. Every few seconds it advances
in-transit shipments along their routes, recomputes each ETA from the distance still to drive,
and occasionally raises a delay, an unscheduled door opening or a tracking dropout — landing as
an alert, a toast and a row flash at once. Positions are written back to the API, so movement
survives a reload; the simulated alerts are client-side only and do not. It stands in for
telemetry the backend does not yet receive, and pauses when the tab is hidden (⏸ in the top bar
stops it entirely).

**Every third-party service used is free and needs no key**: OpenStreetMap raster tiles for the
maps, and the Google Fonts stylesheet for Inter. Nothing else leaves the browser.

## Stack

React 19 · React Router 7 · Vite · Leaflet + react-leaflet · Recharts · plain CSS with custom
properties. Backed by a Spring Boot 4 / Java 21 API. State is Context + `useReducer` with slices for auth, shipments, alerts and
appointments. No UI framework — `src/components/ui/` is a hand-built kit (Button, Input, Select,
DatePicker, Modal, Drawer, Tabs, Table, Badge, StatusPill, Card, StatCard, Toast, Skeleton,
EmptyState, Pagination, Avatar and friends) reused everywhere.

Design notes, conventions and the reasons behind them are in `CLAUDE.md`.
