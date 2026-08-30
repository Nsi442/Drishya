# Builds the Vite bundle, then serves it as static files. Two stages so the
# shipped image carries nginx and a few hundred kilobytes of assets rather than
# Node and node_modules.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /build

# Lockfile first, as its own layer. Dependencies change far less often than
# source, so an ordinary code change reuses this instead of reinstalling.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked in at build time, not read at runtime: Vite substitutes VITE_* into the
# bundle during the build, so this image is specific to one API origin.
#
# Defaults to the relative /api that nginx proxies to the backend below. Stated
# explicitly rather than left empty — an empty string is a value, not an absent
# one, and it used to survive into the bundle as a blank base that sent every
# request to an unprefixed path.
ARG VITE_API_BASE="/api"
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# --- serve ------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost. Busybox wget resolves localhost to ::1 first and
# nginx's `listen 80` binds IPv4 only, so the probe gets connection-refused
# against a server that is serving perfectly — the container reports
# unhealthy while every real request succeeds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1
