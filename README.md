# TRAFFIC MAROC 🇲🇦

Mobile-first road-report app for Morocco: React + TypeScript + Vite (PWA) · Fastify · Prisma/PostgreSQL · Leaflet/OpenStreetMap · Arabic (RTL) / French / English.

> **Data honesty.** The app shows two kinds of data and never mixes them: **application reports** (made by drivers using this app) and **live traffic provider data** (only when a real provider is configured). With `TRAFFIC_PROVIDER=none` (default) no live traffic is displayed, and route ETAs are labelled as theoretical estimates. Nothing in the code generates traffic conditions.

## Installation
Requires Node 20+, PostgreSQL 14+ (or `docker compose up -d`).

    cp .env.example backend/.env          # fill JWT_SECRET etc.
    cd backend && npm install
    npx prisma generate
    npx prisma migrate dev --name v1      # see "Database" for upgrading an existing DB
    npm run seed                          # 11 major cities (+ flagged demo incidents if SEED_DEMO=true)
    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long passphrase' npm run create-admin
    npm run dev                           # API on :3001
    # second terminal
    cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :3001)

## Architecture
    backend/src
      app.ts            all HTTP routes (Fastify), validation (zod), rate limits, error mapping
      auth.ts           bcrypt hashing, JWT (HS256), authenticate / optionalAuth / requireAdmin
      store/            Store interface · PrismaStore (PostgreSQL) · MemoryStore (tests)
      providers/        traffic.ts (provider abstraction) · ai.ts · geo.ts (Nominatim + OSRM)
      storage.ts        local disk · S3-compatible (AWS S3, Cloudflare R2)   upload.ts  magic-byte validation
      notify.ts         near-favorite and report-status notifications
      logic.ts          TTL, duplicate detection (same type < 100 m), vote outcome, city lookup
    frontend/src
      i18n/ (fr = source, ar, en)   lib/ (api, auth, app state, offline queue)
      components/ (MapView with clustering, sheets, PhotoPicker, PlaceSearch)   pages/ (Map, Reports, Routes, Favorites, Notifications, Profile, Cities, Admin)
    frontend/public   sw.js · manifest.webmanifest · PNG + maskable icons

The API is storage-agnostic: routes talk to the `Store` interface, so the whole API is tested without a database.

## Database & Prisma
Models: User, City, Incident, IncidentConfirmation, IncidentPhoto, SavedLocation, Notification, TrafficProvider, TrafficSnapshot, AuditLog. Enums: `Status`, `Source`, `Role`, `FavoriteKind`, `NotificationType`. Indexes cover status/expiry, city, owner, type and coordinates. `Incident.clientId` is unique (idempotent offline sync); `IncidentConfirmation` is unique per (incident, voter).

**Upgrading an existing database (do not lose data).** Run `npx prisma migrate dev --name v1` on a copy first and read the SQL Prisma proposes. Points to check:
- `User.role` was a `String`; it becomes the `Role` enum. Existing values must be exactly `USER` or `ADMIN` (fix others first); Prisma may ask to cast.
- New columns have defaults or are nullable (`passwordHash` is **required**: if you already have User rows without passwords, delete or back-fill them before migrating).
- Existing cities are kept; seed only adds `slug`/Arabic/English names and the missing cities.
No migration SQL ships in this repo (see Known limitations): generate it with the command above and commit `backend/prisma/migrations/`. In production use `npm run migrate:deploy`.

## Environment variables
See `.env.example` (placeholders only). Secrets live in `backend/.env`; the frontend bundle contains none. In production `JWT_SECRET` (32+ chars) is mandatory — the server refuses to start without it.

## Authentication
Register / login / logout / profile (`/api/auth/*`). Passwords: bcrypt (cost 12). Tokens: JWT HS256, 7 days by default, stored in the browser's `localStorage` and sent as `Authorization: Bearer`. Each token carries the user's `tokenVersion`; logout, password change, role change and account disabling bump it, which **revokes all previously issued tokens**. Login is rate-limited (10 / 10 min / IP) and gives the same error for unknown e-mail and wrong password. Role is never accepted from the client. Anonymous reporting can be switched off with `ALLOW_ANONYMOUS_REPORTS=false`.

## Admin setup
`ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin` creates or promotes an ADMIN (password ≥ 12 chars). Admins can then promote other users in the web UI. The old `x-admin-token` header no longer exists. Admin UI (Profile → Administration): statistics, reports/incidents (approve, reject with reason, expire, delete), users (role, enable/disable), notifications, providers status, audit log. Every admin mutation writes an `AuditLog` row (actor, entity, before/after).

## Storage (photos)
JPEG/PNG/WebP, max 5 MB (`MAX_UPLOAD_MB`), max 4 per incident. Validation checks the declared MIME **and** the file's magic bytes; filenames are server-generated; JPEG EXIF/GPS segments are stripped. Only the report's owner (or an admin) can attach photos. `STORAGE_PROVIDER=local` writes to `STORAGE_LOCAL_DIR`; `s3` / `r2` use any S3-compatible API (for Cloudflare R2 set `STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `STORAGE_REGION=auto`). Photos are served through `/api/photos/:id`; the bucket can stay private. Mobile: camera capture and gallery pickers, preview, remove, per-file upload progress.

## Traffic provider
`providers/traffic.ts` defines `TrafficProvider { name, available, getTraffic(bbox), getRouteEta? }`. `TRAFFIC_PROVIDER=none` → `NoTrafficProvider` (available=false). A TomTom adapter (flow segments on a grid) is included; a missing key or unknown name **falls back to none**, never to fake data. A failing provider degrades to "unavailable". To add HERE / Google / Mapbox, implement the interface and register it in `createTrafficProvider`. Provider data is returned as `dataKind: LIVE_TRAFFIC_PROVIDER`, driver reports as `APPLICATION_REPORT`, and the UI badges them differently everywhere (map, city dashboard, routes).

## Routing and geocoding
OSRM (`ROUTING_API_URL`) returns up to 3 routes with distance and base duration; Nominatim (`GEOCODING_API_URL`, restricted to Morocco) powers search and reverse lookup. If no provider offers a traffic-aware duration the response has `trafficAwareEta:false` and the UI says so explicitly. The planner supports search, current location, pick-on-map, swap, favorites as endpoints, polyline, distance, ETA, and lists application reports within 150 m of the route. Public OSM servers have usage limits and no SLA — self-host for production.

## Traffic AI (optional)
`AI_PROVIDER=none` (default) hides the feature; the app is fully functional without it. With `anthropic` (+ `AI_API_KEY`, `AI_MODEL`) the city dashboard offers a summary. The model receives **only** aggregated application-report counts and, if configured, provider readings, with a system prompt forbidding guesses. If there is no reliable data the model is **not called** and the UI says no summary is available. Failures are reported, not hidden. Treat the output as a text summary of the displayed numbers, not as an independent source.

## PWA and offline mode
Service worker: app-shell precache with offline fallback, stale-while-revalidate assets, capped map-tile cache, and cached public GETs (`/api/incidents`, `/api/cities`) for offline reading. Authenticated, admin, notification, favorite and traffic calls and all non-GET calls are never cached. Offline reports go to a local queue; each has a client UUID (`clientId`) that the server uses as an idempotency key, so retries or concurrent syncs cannot create duplicates. Sync runs on reconnect, every 30 s, via a "Sync now" button, and through Background Sync where supported. A banner shows connection and queue state. Photos cannot be queued offline (they are added later from Reports). Browser notifications are opt-in: they are requested only when the user switches the toggle on, and shown only when the app is in the background.

## Testing
    cd backend  && npm test && npm run typecheck     # 77 tests, no DB needed
    cd frontend && npm test && npm run typecheck && npm run build   # 73 tests
Covered: authentication & token revocation, incidents, duplicate detection, idempotent sync, expiration, uploads (MIME, magic bytes, size, EXIF, traversal), favorites, notifications, admin authorization on every admin route, audit, hotspots, provider fallback, AI guardrails, routing ETA flag, city dashboard separation, security headers/CORS/limits; frontend: translation completeness (ar/fr/en keys, placeholders, every API error code translated, no hardcoded French) and the offline queue.

## Deployment
Run Postgres, `npm run build && node dist/server.js` for the API (set `NODE_ENV=production`, `JWT_SECRET`, `CORS_ORIGINS`, `DATABASE_URL`, storage vars; `npm run migrate:deploy` before start), and serve `frontend/dist` over HTTPS (required for service worker, geolocation, camera). Put both behind one reverse proxy so `/api` is same-origin; set a Content-Security-Policy there (the API disables helmet's CSP because it serves JSON only). With a proxy, `trustProxy` is on in production so rate limits use the real client IP. Use S3/R2 rather than local disk on multi-instance or ephemeral hosts.

## Security
bcrypt hashing; JWT with revocation; role checks on every admin route; zod validation on all inputs; per-route rate limits (auth, reports, uploads, votes, search, AI) plus a global limit; 256 KB JSON body limit and upload size limit; helmet headers; CORS allow-list; uploads validated by content, EXIF stripped, random names, path-traversal-safe local storage; public incident view hides reporter identity and device hashes; admin provider status exposes no keys; audit log for admin actions; no secrets in the bundle; production start refuses a weak `JWT_SECRET`.

## Known limitations
- Not verifiable in the authoring environment: Prisma engine download and database run, so `PrismaStore`, the seed and `create-admin` were type-checked but **never executed against PostgreSQL**; no migration SQL is committed.
- JWT is in `localStorage` (XSS-exposed by nature); httpOnly cookies + CSRF protection would be stronger.
- Votes by anonymous users are keyed on a hash of IP + user-agent + device id: easy to evade, so one person can inflate confirmations. Account-only voting is stricter.
- Duplicate detection and city assignment are in-process (no PostGIS); fine for thousands of active reports, not millions.
- Expiry runs every 60 s in-process (multi-instance: each runs it; it is idempotent). Notifications are pulled (60 s poll), not pushed: no Web Push yet.
- TomTom adapter written from public docs, never called live; no traffic-aware route ETA adapter is implemented, so ETAs stay "unavailable" even with a provider.
- Not exercised: browser UI (no browser available), service worker behaviour, camera capture, RTL visual layout, S3/R2 and Anthropic calls against real services.
- Arabic text is standard Arabic, not reviewed by a native speaker; Darija wording not included.
