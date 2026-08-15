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

No test runner is configured in this project.

## Architecture

This is a freshly scaffolded Vite + React 19 app (plain JavaScript, no TypeScript) and is currently almost identical to the default `create-vite react` template:

- `src/main.jsx` — entry point; mounts `<App />` into `#root` inside `StrictMode`
- `src/App.jsx` — still the default Vite/React starter UI (counter demo + docs links); real application UI has not been built yet and will replace this placeholder
- `index.html` — Vite HTML entry point
- `eslint.config.js` — flat ESLint config using `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` alongside `@eslint/js` recommended rules

There is no routing, state management, or backend/API integration set up yet.
