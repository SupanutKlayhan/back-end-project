# Hotel Booking REST API

REST API for hotel rooms, bookings, room search and booking notifications (ITCS258 Unit Project).
Built with **NestJS 12, TypeScript, Prisma 7 (MySQL / MariaDB), Redis, JWT**, documented with **Swagger / OpenAPI**, tested with **Jest + Supertest** and shipped as a **Docker** image.

| | |
|---|---|
| Team | `691_ITCS258_Group05`|
| Member | 6788050 Supanat Klayhan  | 6788153 Risa Smuthkochorn | 6788165 Pongsakorn Arayasak |
| Deployed API | https://api-production-6d2cc168.up.railway.app |
| Swagger UI | https://api-production-6d2cc168.up.railway.app/api-docs (locally `http://localhost:3000/api-docs`) |
| OpenAPI file | [`openapi.json`](openapi.json) (also served at `/api-docs-json`) |
| Health check | `GET /health` |

## Contents

1. [Architecture](#1-architecture)
2. [Roles, access rules and test accounts](#2-roles-access-rules-and-test-accounts)
3. [Environment setup](#3-environment-setup)
4. [Run in development](#4-run-in-development)
5. [Build and run with Docker](#5-build-and-run-with-docker)
6. [API documentation (Swagger)](#6-api-documentation-swagger)
7. [API usage examples](#7-api-usage-examples)
8. [Business rules and error format](#8-business-rules-and-error-format)
9. [Performance, caching and rate limiting](#9-performance-caching-and-rate-limiting)
10. [Logging and monitoring](#10-logging-and-monitoring)
11. [API Testing document](#11-api-testing-document)
12. [Deployment](#12-deployment)
13. [Known limitations](#13-known-limitations)
14. [AI declaration](#14-ai-declaration)

---

## 1. Architecture

```mermaid
flowchart LR
    C[Client / Swagger UI] -->|HTTPS| API[NestJS API]
    API -->|Prisma + MariaDB driver| DB[(MySQL / MariaDB)]
    API -->|cache + token deny list| R[(Redis)]
    API -->|files| V[/uploads volume/]
```

Request path: **guards** (JWT, roles, rate limit) → **validation pipe** → **controller** → **service** (business rules) → **Prisma** → database. Responses pass through the **response envelope** interceptor; errors through one **exception filter**.

```
src/
  auth/            login, register, logout, JWT strategy, guards (JwtAuthGuard, RolesGuard)
  users/           own profile (GET/PATCH /users/me)
  rooms/           listing, details, search, admin CRUD, image upload, Redis cache
  bookings/        create/list/view/cancel, admin status changes, status rules (booking-status.ts)
  notifications/   booking created / cancelled events
  health/          GET /health (database + Redis)
  common/          pipes, filters, interceptors, decorators, Swagger enhancer, date validation
  config/          start-up check of required environment variables
  database/seed.ts  creates the test accounts and sample rooms (safe to run repeatedly)
prisma/schema.prisma   users, rooms, bookings, notifications
test/                   end-to-end tests (real database)
```

Business rules (date validation, status transitions) are small pure functions so they can be unit-tested without a database.

## 2. Roles, access rules and test accounts

Roles stored in the database: **USER** and **ADMIN** (FR-5). A **guest** is simply someone without a token, so it is not a database role.

| Capability | Guest | User | Admin |
|---|:-:|:-:|:-:|
| Register, log in | ✅ | – | – |
| List rooms, room details (with image), search available rooms, health | ✅ | ✅ | ✅ |
| Own profile (view / update), log out | ❌ | ✅ | ✅ |
| Create booking, list / view / cancel **own** bookings | ❌ | ✅ | ✅ |
| Own notifications | ❌ | ✅ | ✅ |
| Create / edit / delete / enable / disable rooms, upload room image, list inactive rooms | ❌ | ❌ | ✅ |
| List and view **all** bookings, approve / mark paid / cancel any booking | ❌ | ❌ | ✅ |

No token → `401`. Wrong role → `403`. Another user's booking → `404` (its existence is not revealed).

**Test accounts** (created by the seed script; classroom demo only — change them for anything real):

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@example.com` | `Admin123!` |
| USER | `user@example.com` | `User1234!` |

Anyone who signs up through `POST /auth/register` is always a regular `USER`. The seed also creates five sample rooms.

## 3. Environment setup

Requirements: **Node.js 24+**, **npm**, **Docker Desktop / Docker Engine with Compose** (for the database and Redis, or for running everything in containers), Git.

```bash
git clone https://github.com/ppngskrn/back-end-project.git
cd back-end-project/nest-prisma-lab
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` (never commit it). All configuration comes from environment variables — nothing is hard-coded:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Database connection string, `mysql://user:password@host:3306/db` (required) |
| `REDIS_URL` | Redis connection string, `redis://host:6379` (required) |
| `JWT_SECRET` | Secret used to sign tokens (required; use a long random value) |
| `PORT` | HTTP port, default `3000` (cloud platforms set it themselves) |
| `TRUST_PROXY` | `true` behind a reverse proxy, so rate limits use the real client IP |
| `RUN_SEED` | `true` = run the seed (accounts + sample rooms) every time the container starts |
| `UPLOAD_DIR` | Where room images are stored, default `./uploads` (`/app/uploads` in Docker) |
| `DISABLE_CACHE`, `DISABLE_THROTTLE` | `true` only in automated tests |
| `SEED_*` | Override the default seed accounts |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ROOT_PASSWORD` | Used by Docker Compose to create the local database |

The app refuses to start if `DATABASE_URL`, `REDIS_URL` or `JWT_SECRET` is missing.

## 4. Run in development

### 4.1 Without Docker for the API (API on your machine, database and Redis in Docker)

```bash
docker compose -f compose.yml -f compose.local.yml up -d --wait db redis
npm ci
npm run db:generate      # creates the Prisma client (Prisma 7 does not do this automatically)
npm run db:deploy        # applies the migrations in prisma/migrations
npm run build
npm run seed             # test accounts + sample rooms
npm run start:dev        # http://localhost:3000  (Swagger: /api-docs)
```

Changing `prisma/schema.prisma`? Create a migration with `npm run db:migrate -- --name <what_changed>`, then `npm run db:generate`, and commit the new folder in `prisma/migrations`.

No Docker at all: install MySQL/MariaDB and Redis yourself and point `DATABASE_URL` / `REDIS_URL` at them.

### 4.2 Everything in Docker

```bash
docker compose -f compose.yml -f compose.local.yml up -d --build --wait
docker compose -f compose.yml -f compose.local.yml exec app node dist/database/seed.js
curl http://localhost:3000/health
```

The container applies pending migrations on start. Stop with `docker compose -f compose.yml -f compose.local.yml down` (add `-v` only to delete the database and uploads).

## 5. Build and run with Docker

The `Dockerfile` is a **multi-stage production build**: the first stage installs dependencies, generates the Prisma client and compiles TypeScript; the final stage contains only production dependencies and the compiled code, runs as the unprivileged `node` user and has a `HEALTHCHECK`. It contains **no secrets** — everything comes from environment variables.

```bash
docker build -t hotel-api .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e REDIS_URL="redis://host:6379" \
  -e JWT_SECRET="a-long-random-string" \
  -e RUN_SEED=true \
  hotel-api
```

On start the container runs `prisma migrate deploy`, then (if `RUN_SEED=true`) the idempotent seed, then the API.

Compose files (`compose.yml` is the base; add one overlay):

| Files | Use |
|---|---|
| `compose.yml` | App + MariaDB 11.4 + Redis 7, **publishes no ports** |
| `+ compose.local.yml` | Local development: ports on `127.0.0.1` only (3000, 3307, 6379) |
| `+ compose.production.yml + compose.direct.yml` | A single server: restart policies and the API on port 80 |

## 6. API documentation (Swagger)

- **Swagger UI:** `/api-docs` · **OpenAPI JSON:** `/api-docs-json` · committed copy: [`openapi.json`](openapi.json)
- Every endpoint lists its parameters, request body, response schema and the status codes it can return (success envelope and the shared error schema).
- **Authentication in Swagger:** call `POST /auth/login` with a seed account → copy `data.access_token` → click **Authorize** → paste the token (without "Bearer") → locked endpoints now work. The token is remembered while the page stays open.
- Regenerate the committed file after changing endpoints: start the API, then `curl http://localhost:3000/api-docs-json -o openapi.json`.

## 7. API usage examples

Replace `$BASE` with `http://localhost:3000` or the deployed URL. (PowerShell: use `curl.exe` and put JSON in single quotes, or use Swagger UI.)

**Every successful response** looks like `{ "success": true, "message": "...", "data": ..., "meta": ... }` (`meta` only for paginated lists).

```bash
# 1. Sign up (always a regular user) and log in
curl -X POST $BASE/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Ann Smith","email":"ann@example.com","password":"Passw0rd!"}'
curl -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"User1234!"}'
# -> {"success":true,"message":"Login successful","data":{"access_token":"eyJ..."}}
TOKEN=eyJ...   # paste data.access_token

# 2. Browse and search rooms (no token needed)
curl "$BASE/rooms?page=1&limit=5"
curl "$BASE/rooms/1"
curl "$BASE/rooms/search?check_in=2026-12-24T14:00:00.000Z&check_out=2026-12-26T11:00:00.000Z&capacity=2"

# 3. Book a room, list own bookings, cancel
curl -X POST $BASE/bookings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"room_id":1,"check_in":"2026-12-24T14:00:00.000Z","check_out":"2026-12-26T11:00:00.000Z"}'
curl $BASE/bookings -H "Authorization: Bearer $TOKEN"
curl -X PATCH $BASE/bookings/1/cancel -H "Authorization: Bearer $TOKEN"

# 4. Notifications and profile
curl "$BASE/notifications?unread=true" -H "Authorization: Bearer $TOKEN"
curl -X PATCH $BASE/notifications/1/read -H "Authorization: Bearer $TOKEN"
curl $BASE/users/me -H "Authorization: Bearer $TOKEN"
curl -X PATCH $BASE/users/me -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Ann S."}'

# 5. Admin: log in as admin@example.com, then
curl -X POST $BASE/rooms -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"name":"Garden Suite","capacity":3,"price_per_night":2100}'
curl -X POST $BASE/rooms/1/image -H "Authorization: Bearer $ADMIN" -F "file=@room.jpg"
curl -X PATCH $BASE/rooms/1/disable -H "Authorization: Bearer $ADMIN"
curl -X PATCH $BASE/bookings/1/status -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"status":"APPROVED"}'
curl "$BASE/bookings?status=PENDING" -H "Authorization: Bearer $ADMIN"      # every user's bookings

# 6. Log out (the token stops working immediately)
curl -X POST $BASE/auth/logout -H "Authorization: Bearer $TOKEN"
```

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` |
| Users | `GET /users/me`, `PATCH /users/me` |
| Rooms (public) | `GET /rooms`, `GET /rooms/:id`, `GET /rooms/search` |
| Rooms (admin) | `POST /rooms`, `PUT /rooms/:id`, `DELETE /rooms/:id`, `PATCH /rooms/:id/disable`, `PATCH /rooms/:id/enable`, `POST /rooms/:id/image`, `GET /rooms/admin/all` |
| Bookings | `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id/cancel`, `PATCH /bookings/:id/status` (admin) |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read` |
| Operations | `GET /health` |

Room images: `POST /rooms/:id/image` (form field `file`, JPEG / PNG / WebP, max 2 MB). The returned `image_url` (for example `/uploads/rooms/<id>.png`) is part of `GET /rooms/:id` and the file is served from that path.

## 8. Business rules and error format

- Dates are ISO-8601 (use UTC, e.g. `2026-12-24T14:00:00.000Z`). `check_in` must be before `check_out` and not in the past (`400` otherwise).
- Stays are half-open intervals: a booking ending at 12:00 does not clash with one starting at 12:00.
- **No double booking:** creating a booking runs in one database transaction that first locks the room row (`SELECT ... FOR UPDATE`), then checks for overlapping non-cancelled bookings. Simultaneous requests are therefore processed one after the other and all but one get `409`.
- The booking and its notification are saved in the same transaction, so a confirmed booking is never without its event (FR-30, NFR-8).
- Status flow: `PENDING → APPROVED → PAID`; `PENDING` or `APPROVED` can be `CANCELLED`; `PAID` and `CANCELLED` are final (`409` otherwise). Users can only cancel their own bookings; admins can do every step. Cancelling records a `BOOKING_CANCELLED` notification.
- A deactivated room disappears from public listing, details and search and cannot be booked; admins still see it in `GET /rooms/admin/all`.

Every error has the same shape and a fitting HTTP status:

```json
{ "success": false, "statusCode": 400, "message": "Validation failed",
  "errors": ["capacity must be an integer number"], "path": "/rooms", "timestamp": "2026-11-19T10:00:00.000Z" }
```

`400` invalid input (every problem is listed in `errors`, unknown fields are rejected) · `401` missing/invalid/revoked token · `403` wrong role · `404` not found · `409` conflict (overlap, duplicate e-mail, illegal status change) · `413` image too large · `429` rate limit · `503` database unavailable.

## 9. Performance, caching and rate limiting

### Caching (Redis)

| | |
|---|---|
| **Where** | `GET /rooms` (every page/filter combination) and `GET /rooms/:id` — `src/rooms/rooms.service.ts` (`findPublic`, `findPublicOne`) |
| **Why** | Hotel rooms change rarely but are read by every visitor, so these are the most frequent, most repeatable reads. Caching removes most of the database load for them. |
| **Freshness** | Entries live 5 minutes **and** are invalidated on every room change (create, edit, delete, enable/disable, image upload): each entry key contains a "version" stamp, and any write stores a new version, so all old pages become unreachable immediately. A user never sees a room list older than the last admin change. |
| **What is not cached** | Room **search** and **bookings**: availability changes with every booking, so a cached answer could show a room that is already taken. |
| **Failure mode** | If Redis is down the API reads from the database instead (slower, not broken). |

Redis is also used for the logout deny list (a logged-out token id is stored until the token would expire anyway).

### Rate limiting (`@nestjs/throttler`)

| Endpoint | Limit |
|---|---|
| All endpoints (default) | 100 requests / minute / client |
| `POST /auth/login`, `POST /auth/register` | 5 / minute — makes password guessing and mass sign-ups impractical |
| `POST /bookings` | 10 / minute — stops a client from flooding the booking transaction |
| `GET /health` | not limited (monitoring polls it) |

Exceeding a limit returns `429`. **How it helps stability:** a single abusive or buggy client can no longer use up database connections or CPU needed by everyone else, and brute-force attempts on the login are slowed down. Counters are kept in memory per instance (see limitations).

### Other performance and concurrency measures

- Index on `bookings(room_id, check_in, check_out)` — makes the overlap check and the search "not booked" filter cheap.
- All lists are **paginated** (default 10, max 100).
- Search is one database query (no loop per room).
- The room-row lock keeps booking creation correct under concurrent requests (verified by a test that fires 5 identical requests at once).
- Stateless JWT authentication and shared Redis/database state: more API instances can be added behind a load balancer (see limitations for the two exceptions).

## 10. Logging and monitoring

- One log line per successful request: `GET /rooms 200 14ms user=3` (method, **path only**, status, duration, user id). Query strings, headers and bodies are never logged, so passwords and tokens cannot leak.
- Booking actions are logged with ids (`Booking created id=5 user=2 room=1`, `Booking id=5 -> CANCELLED by user=2 (USER)`). Failed requests are logged with the status (`warn` for 4xx, `error` with stack trace for 5xx).
- `GET /health` returns `200 {"status":"ok","db":"up","redis":"up",...}` or `503` if the database or Redis is unreachable. It is used by Docker (`HEALTHCHECK`), by Railway deployment checks and can be polled by any uptime monitor.
- Logs go to stdout (the Docker / Railway convention), ready for any log collector.

## 11. API Testing document

### 11.1 Strategy

| Level | What | Where | Database |
|---|---|---|---|
| **Unit** | Business rules and services in isolation (Prisma and Redis replaced by mocks) | `src/**/*.spec.ts` | none |
| **Integration** | HTTP layer with real validation pipe and guards bypassed, service mocked (`rooms.controller.integration.spec.ts`); plus **API tests of whole endpoints against the real database** | `src/rooms/*.integration.spec.ts`, `test/rooms.e2e-spec.ts`, `test/bookings.e2e-spec.ts` | real MySQL/MariaDB |
| **End-to-end** | A complete customer journey through the HTTP API with the database state checked after each change | `test/auth-flow.e2e-spec.ts` | real MySQL/MariaDB |

The e2e suites run the real `AppModule` (real validation, guards, filters, Prisma and the real database); only Redis is replaced by an in-memory stand-in so the tests need no Redis. Rate limiting is switched off for them (`DISABLE_THROTTLE`). **Every suite removes the users, rooms, bookings and notifications it created** (`afterAll`).

### 11.2 How to run

```bash
# one-time setup: database must be reachable through DATABASE_URL in .env
docker compose -f compose.yml -f compose.local.yml up -d --wait db redis
npm ci && npm run db:generate && npm run db:deploy

npm test            # unit + controller-integration tests (no database needed)
npm run test:e2e    # API/end-to-end tests against the database
```

> The e2e tests create temporary data in the database from `DATABASE_URL` and delete it afterwards. Use the development database, never a production one.

### 11.3 Test cases

**Unit tests — 64 tests in 8 suites (`npm test`)**

| Suite | Cases (what is asserted) |
|---|---|
| `booking-status.spec.ts` (5) | Admin can walk PENDING→APPROVED→PAID; PENDING/APPROVED can be cancelled; PAID and CANCELLED never change; no skipping steps; users can only cancel |
| `stay-range.spec.ts` (4) | Valid stay returns both dates; invalid date strings → 400; `check_in` ≥ `check_out` → 400 (FR-19); `check_in` in the past → 400 |
| `bookings.service.spec.ts` (10) | Room is locked, booking + notification saved together; overlap → 409 and nothing written (FR-20); missing/inactive room → 404; invalid dates rejected before the database; owner can cancel + notification (FR-31); someone else's booking → 404; user cannot approve; admin can approve without notification; cancelled booking cannot change; users only list their own bookings |
| `auth.service.spec.ts` (4) | Token for correct password with role/email in payload; wrong password and unknown e-mail give the same error; logout stores the token id with the right lifetime; expired token is not stored |
| `users.service.spec.ts` (6) | Registration creates a USER with a bcrypt hash and no password in the result (NFR-1, NFR-4); duplicate e-mail → 409; new password needs the current one; wrong current password → 401; name update returns no password; empty update rejected |
| `rooms.service.spec.ts` (19) | Create/read/update/delete incl. not-found and database-error paths; pagination, filters and limit clamping; public list is active-only and served from cache; any room write makes cached pages stale; inactive room is a 404 for the public; works when Redis fails; search query excludes overlapping non-cancelled bookings and honours capacity |
| `rooms.controller.integration.spec.ts` (12) | Real HTTP requests to the controller with a mocked service: status codes, query parsing, validation (400), 404 mapping for create/list/get/update/delete |
| `response-envelope.interceptor.spec.ts` (4) | Plain objects, paginated lists, empty results and look-alike objects are wrapped correctly (FR-34) |

**API and end-to-end tests — 30 tests in 3 suites (`npm run test:e2e`)**

| Suite | Cases |
|---|---|
| `rooms.e2e-spec.ts` (9) — room CRUD as admin | Create (201, envelope); create without token → 401; list contains the room; deactivated room hidden from public list/details but visible to the admin list; get by id incl. `image_url` (FR-16); update (200); update unknown room → 404; delete (200); deleted room → 404 |
| `bookings.e2e-spec.ts` (12) — bookings, conflicts, search | Booking requires login (401); PENDING booking created (201); `BOOKING_CREATED` notification stored; overlapping booking → 409; back-to-back stay allowed; invalid dates → 400; unknown room → 404; **5 simultaneous identical requests → exactly one 201 and four 409, one row in the database**; search hides a booked room and shows it for free dates; user sees only own bookings and gets 404 for another's; user cannot change status (403) but admin can; cancel frees the room, stores `BOOKING_CANCELLED`, second cancel → 409 |
| `auth-flow.e2e-spec.ts` (9) — customer journey | Sign-up (201, role USER, no password in response, bcrypt hash in database); duplicate e-mail → 409, invalid input → 400, `role` in the body rejected; login right/wrong password; view and update profile (database checked), password change needs current password; search finds the room; booking stored as PENDING with notification; search no longer lists the room; cancel changes status, adds notification and makes the room searchable again; logout revokes the token (next call → 401) |

### 11.4 Results

| Command | Result |
|---|---|
| `npm test` | **8 suites passed, 64 tests passed** |
| `npm run test:e2e` | **3 suites passed, 30 tests passed** |

Last run: 19/11/2026 — Node 24, MariaDB 11.4 (Docker Compose). Both commands exit with code 0 and print no failures.

## 12. Deployment

**Target: Railway** (container platform; app, MySQL and Redis as three services in one project). Deploy source: a personal GitHub repository (fork) of the project. The same Docker image also runs on an Ubuntu server (section 12.2).

```mermaid
flowchart LR
    U[Users / graders] -->|HTTPS| E[Railway edge + public domain]
    E --> A[API service<br/>Docker image from Dockerfile]
    A -->|private network<br/>DATABASE_URL| M[(MySQL service)]
    A -->|private network<br/>REDIS_URL| R[(Redis service)]
    A --- V[/Volume /app/uploads/]
    G[GitHub repo] -->|push triggers build| A
```

### 12.1 Railway, step by step

1. **Push the code** to your GitHub repository (the folder with the `Dockerfile` is `nest-prisma-lab/`; the folder `nest-prisma-lab/prisma/migrations/` must be committed).
2. **New project:** railway.com → *New Project* → *Deploy from GitHub repo* → pick the repository (allow Railway's GitHub app to access it). This creates the API service.
3. In the API service → **Settings → Source → Root Directory** = `/nest-prisma-lab`. Railway builds the `Dockerfile` found there.
4. In the same project click **+ New → Database → Add MySQL**, then **+ New → Database → Add Redis**.
5. API service → **Variables** (use the _Raw editor_ and adjust the service names `MySQL` / `Redis` if yours differ):
   ```
   DATABASE_URL=${{MySQL.MYSQL_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<long random string>
   TRUST_PROXY=true
   RUN_SEED=true
   ```
   Generate the secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Railway sets `PORT` itself; the app listens on it.
6. **Keep uploaded images across deploys:** API service → **Settings → Volumes** (or `Ctrl/Cmd+K` → *Volume*) → mount path `/app/uploads`, and add the variable `RAILWAY_RUN_UID=0` (the container otherwise runs as an unprivileged user that cannot write to the volume).
7. API service → **Settings → Deploy → Healthcheck Path** = `/health`. Railway waits for a `2xx` from it before switching traffic (default timeout 300 s).
8. API service → **Settings → Networking → Generate Domain**. Open `https://<domain>/health` and `https://<domain>/api-docs`.
9. Every `git push` to the connected branch builds and deploys automatically. The container applies new migrations on start, then seeds (`RUN_SEED=true`), then starts the API. The logs are in the service's **Deployments → View logs**.

**Verify the deployment:**
```bash
curl https://<domain>/health                                  # {"status":"ok","db":"up","redis":"up",...}
curl -X POST https://<domain>/auth/login -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"Admin123!"}'  # token
curl "https://<domain>/rooms"                                 # the five sample rooms
```

Environment: Railway container platform; MySQL and Redis are managed by Railway inside a private network (the database is **not** reachable from the internet); HTTPS terminated by Railway.

### 12.2 Alternative: your own Ubuntu server (Docker Compose, deploy key)

1. Create an Ubuntu server with a public IP, install Docker Engine + the Compose plugin ([docs](https://docs.docker.com/engine/install/ubuntu/)); allow only ports 22 and 80 in the firewall.
2. Create a read-only deploy key on the server and add it on GitHub (**Settings → Deploy keys**, _Allow write access_ unchecked):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/hotel_deploy -N "" -C "hotel-server"
   cat ~/.ssh/hotel_deploy.pub
   printf 'Host github.com\n  IdentityFile ~/.ssh/hotel_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   ssh -T git@github.com
   ```
3. ```bash
   git clone git@github.com:<user>/back-end-project.git && cd back-end-project/nest-prisma-lab
   cp .env.example .env && nano .env      # strong JWT_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD; RUN_SEED=true
   F="-f compose.yml -f compose.production.yml -f compose.direct.yml"
   docker compose $F up -d --build --wait
   curl http://localhost/health
   ```
4. Update later: `git pull && docker compose $F up -d --build --wait app`. Only port 80 is published; database and Redis are reachable inside the Compose network only. For HTTPS use a reverse proxy (Lab 13) and `TRUST_PROXY=true`. Run one API instance only.

### 12.3 Test accounts on the deployed system

See [section 2](#2-roles-access-rules-and-test-accounts) (`admin@example.com` / `user@example.com`). These are demo accounts for grading; the real secrets (`JWT_SECRET`, database password) exist only as Railway variables and are not in the repository.

## 13. Known limitations

- Login tokens last 1 hour. Logging out revokes the token through Redis; if Redis is down, a logged-out token keeps working until it expires.
- Rate-limit counters are stored in memory, so with several API instances each keeps its own counter. Migrations run when a container starts, so run one instance at a time.
- Uploaded room images are stored on disk (a volume in production). Replacing an image leaves the old file on disk; there is no image resizing.
- No payment processing: `PAID` is a status an admin sets.
- Seed accounts use public demo passwords; change or remove them for real use.
- The load behaviour was verified with concurrent-request tests only, not with a load-testing tool.

## 14. AI declaration

Have to fill
