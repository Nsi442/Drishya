# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project location

The actual application lives in the `drishya_frontend/` subdirectory. Run all commands from there (`cd drishya_frontend`).

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — run ESLint

No test runner is configured. The backend carries an end-to-end API suite at
`../../Drishya.Backend/scripts/api-smoke-test.sh` (59 assertions, safe to re-run) — with both
servers up, that is the fastest way to tell whether something is genuinely broken.

## What this is

Drishya's frontend: one live view of a shipment moving from a vendor's warehouse into a
marketplace fulfilment centre, shared by three parties behind a single login.

**Never name a real marketplace** in user-facing copy. The four sites are generic
(FC Bhiwandi, Manesar, Whitefield, Sanand). See the repository root `CLAUDE.md`.

Three roles, three portals, one shared shipment object:

| Role | Route | Shell |
|---|---|---|
| Vendor (marketplace seller) | `/vendor/*` | Left sidebar + top bar, comfortable density |
| Driver | `/driver/*` | Mobile-first, bottom tab bar, no sidebar |
| Fulfilment centre | `/fc/*` | Same shell as vendor, denser tables |

## Architecture

```
src/
  lib/          pure helpers — constants, formatting, dates, geo, csv
  services/     the only code that talks to the API
  store/        Context + useReducer, four slices
  hooks/        useAsync, useLiveShipments, useNow, useTableState, useOfflineQueue…
  components/   ui/ (the kit), layout/, shipment/, map/, charts/, schedule/
  pages/        auth/, vendor/, driver/, fc/
```

**The backend is a separate Spring Boot project** at `../../Drishya.Backend` (Java 21, port 8080).
Start it before `npm run dev`; Vite proxies `/api` to it. Its README carries the API conventions.

**Data flows one way.** Pages and components call `src/services/*` and never `fetch` directly.
`services/client.js` is the single choke point — base URL, bearer token, error mapping. There is
no mock layer any more; it was deleted when the API landed.

**Reference data is cached, not re-fetched.** `services/referenceData.js` loads vendors,
fulfilment centres, docks, vehicles and drivers once after sign-in and exposes them synchronously,
because a select's options and a dock name inside a table cell cannot wait on a promise. It is
mutated in place, so modules that imported it at startup see the filled version.

**`setFailureRate()`** (wired to a switch in Settings → Integrations) makes requests reject, so the
error state on every page can be demonstrated without stopping the backend.

**The live simulation is `hooks/useLiveShipments.js`** — the thing that makes the product feel
real. Every 3 s it advances moving shipments along their polyline, recomputes ETA from the
distance still to drive, and occasionally raises a delay, a door-open or a device dropout. Those
push a real alert *and* a toast, so the map, the alert feed and the arrival board are always
describing the same event. It pauses when the tab is hidden.

## Conventions learned the hard way

**No semicolons, single quotes, 2-space indent, `.jsx` in import paths.** Match the file you
are editing.

**A stylesheet that nothing imports fails silently — check reachability, not just the build.**
`ui.css` originally lived behind `components/ui/index.js`, but every page imports the kit's
component files directly, so that barrel never executed and the entire kit — buttons, inputs,
cards, stat cards, tables, modals, drawers, toasts — rendered unstyled. `npm run build` passed,
`npm run lint` passed, and the missing 25 kB of CSS was invisible until someone looked at the
page. Global stylesheets are now imported from `src/index.css`; component-scoped ones
(`map.css`, `driver.css`, …) are imported by the component that owns them. If you add a
stylesheet, confirm it is actually reached — a quick check is that its rules appear in
`dist/assets/*.css` after a build.

**Spacing and line-height come from a ladder, never from a guess.** `--space-1`…`--space-9`,
the composite `--pad-*` values, and `--lh-tight`/`--lh-snug`/`--lh-ui`/`--lh-small`/`--lh-base`/
`--lh-relaxed` are all in `tokens.css`. A component picks a rung; it does not invent a pixel
value. This was rebuilt after the first pass shipped 27 inline paddings and six competing
line-heights, which read as cramped and inconsistent even though each screen looked fine alone.
Small text needs proportionally *more* leading, not less — 11–12px captions use `--lh-small`,
and anything read as a sentence uses `--lh-base`.

**Recurring layouts get a class, not a repeated inline style.** `.pad`, `.list-row`,
`.list-row-inset`, `.verify-row`, `.tabs-inset`, `.panel-head`/`.panel-foot` exist because each
had been hand-written in four to six places with slightly different numbers. If you find
yourself writing the same `style={{ padding… }}` twice, it belongs in `utilities.css`.

**Negative letter-spacing is applied per size, never to every heading.** It helps a 22px title
and actively hurts a 13px one.

**Status is a coloured pill plus a word, never colour alone.** `StatusPill` reads its label and
tone from `lib/constants.js`, so a pill in the vendor table and the same pill on the FC arrival
board cannot drift apart. Add new states there, not inline.

**Chart colours live in CSS variables** (`--chart-1`…`--chart-6`, `--seq-0`…`--seq-6`), assigned
in a fixed order and never cycled. Both the light and dark sets were validated for lightness
band, chroma, CVD separation and contrast — **re-run the validator before changing them**, and
pick dark-mode steps against the dark surface rather than lightening the light ones.

**Reading `Date.now()` during render makes a component impure** and the clock never advances on
screen. Anything showing elapsed time uses `hooks/useNow.js`. The same applies to writing a ref
during render — use the `useLayoutEffect` latest-ref pattern (see `useAsync`, `useHotkeys`).

**`eslint-plugin-react-hooks` v7 is strict** (`purity`, `refs`, `set-state-in-effect`). Prefer
fixing the pattern over disabling: derive instead of mirroring into state, remount with a `key`
instead of resetting in an effect, and use `useSyncExternalStore` for external subscriptions.
The two remaining disables are in `useAsync` and are justified in comments.

**Leaflet children must be Leaflet layers.** A bare `<div>` inside `<MapContainer>` lands in the
map pane and breaks it — use `<Fragment>`. Markers are `divIcon`s, which sidesteps the broken
default-icon-URL problem entirely. Clustering is a hand-rolled screen-space grid, not a library.

**Every external service must be free and keyless.** Map tiles are OpenStreetMap raster; the
only other network requests are the Google Fonts stylesheet in `index.html` and our own API. No
Mapbox, no Google Maps, no geocoding. Never introduce one.

**The live tick is still a browser-side simulation.** It stands in for telemetry the backend does
not receive yet. Positions are POSTed to `/api/shipments/live` so movement survives a reload; the
alerts it invents are local only and say so in `alertService.pushAlert`. When real telemetry
exists, `useLiveShipments` is what gets replaced by a WebSocket or SSE subscription.

**Every page needs loading, empty and error states.** `useAsync` gives you all three; `Table`,
`EmptyState`/`ErrorState` and the `Skeleton*` family render them consistently. An empty state
says *why* it is empty and offers the action that would fill it.

## Demo accounts

Login has three one-click buttons. Credentials are `drishya` for all three:
`priya@anandauto.example` (vendor), `ramesh@fleet.example` (driver),
`imran@fcbhiwandi.example` (fulfilment centre).
