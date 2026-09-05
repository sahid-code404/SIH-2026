# NIRIKSHANX

**SIH26095 — Trust, Monitoring, Surprise Inspection, Evidence Verification & Compliance Intelligence Platform**

NirikshanX is a scheme-agnostic monitoring and verification platform for the Department of Social Justice and Empowerment. Its central question is:

> How strongly can the Ministry trust the operational claims, inspection evidence and compliance state reported by an institution?

## Current phase

**Phases 1–7 are merged and verified on `main`.** Active development is **Phase 8 — Role-aware Workspaces**, tracked by Issue #15 on branch `phase/08-role-aware-workspaces`.

Implemented foundations now include:

- Next.js 16.3.3 App Router web application with strict TypeScript;
- one responsive design system with semantic light/dark tokens and accessibility primitives;
- Java 25 / Spring Boot 4.1.1 modular-monolith backend;
- PostgreSQL 18 + PostGIS 3.6.4 authoritative database;
- Redis 8.8.2 as disposable/non-authoritative infrastructure;
- pinned MinIO local object-storage process;
- Flyway migration history through V6;
- canonical State/District geography with relational constraints;
- authentication with Argon2id passwords, short-lived JWT access tokens and rotating server-side refresh sessions;
- TOTP MFA and privileged-session assurance;
- database-backed roles, granular permissions and NATIONAL/STATE/DISTRICT jurisdiction authorization;
- canonical institutions with PostGIS `geography(Point,4326)` location;
- historical institution memberships that add exact resource scope without bypassing RBAC;
- SQL-scoped institution search/list pagination so inaccessible institutions and totals are not fetched then filtered in the browser;
- scheme-agnostic `schemes`, `institution_scheme_enrollments`, `projects` and `project_milestones`;
- canonical project parentage through an enrollment rather than duplicated unchecked institution/scheme IDs;
- granular scheme/enrollment/project/milestone permissions and institution-inherited scope;
- responsive institution, program, project and milestone workflows backed by real persisted data;
- active Phase 8 role-aware workspace resolution from live roles, effective permissions and resource scope;
- capability-driven product navigation that links only to implemented routes;
- explicit MFA-restricted workspace state rather than pretending withheld permissions are usable;
- configurable published Docker host ports while preserving fixed container-internal service ports;
- real database, authorization, authentication, institution, program, workspace and browser verification gates in CI.

NirikshanX deliberately does **not** invent authoritative institution, scheme, enrollment, project or milestone status taxonomies. Policy-coded fields accept normalized constrained codes until approved government data dictionaries are selected. No fake production institutions, schemes, projects, geography, inspections, risk scores or AI results are seeded.

## Quick start

Requirements: Git, Docker Engine and Docker Compose v2.

### Stable `main`

```bash
git clone git@github.com:sahid-code404/SIH-2026.git
cd SIH-2026
cp .env.example .env
docker compose up --build
```

### Active Phase 8 development

```bash
git switch phase/08-role-aware-workspaces
cp .env.example .env
docker compose up --build
```

Default local endpoints:

```text
Web:           http://localhost:3000
Login:         http://localhost:3000/login
Institutions:  http://localhost:3000/institutions
Programs:      http://localhost:3000/programs
Backend:       http://localhost:8080
MinIO API:     http://localhost:9000
MinIO console: http://localhost:9001
PostgreSQL:    localhost:5432
Redis:         localhost:6379
```

Verify the real backend connectivity contract:

```bash
curl http://localhost:8080/api/v1/system/status
curl http://localhost:8080/actuator/health/liveness
curl http://localhost:8080/actuator/health/readiness
curl http://localhost:3000/api/health
```

Run the current database/domain/security verification against the running Compose stack:

```bash
docker compose exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/verify_database_core.sql
node scripts/verify_workspaces.mjs
node scripts/verify_authorization_current.mjs
node scripts/verify_institutions.mjs
node scripts/verify_programs.mjs
node scripts/verify_authentication.mjs
```

The verification scripts create isolated test fixtures where needed and clean them up. They are not production seed data.

Stop cleanly:

```bash
docker compose down
```

Remove local development data only when intentionally resetting the environment:

```bash
docker compose down -v
```

## Running beside another Docker stack

NirikshanX container-internal addresses stay fixed, but every published host port can be overridden in `.env`:

```text
POSTGRES_HOST_PORT=5432
REDIS_HOST_PORT=6379
MINIO_API_HOST_PORT=9000
MINIO_CONSOLE_HOST_PORT=9001
BACKEND_HOST_PORT=8080
WEB_HOST_PORT=3000
```

For example, a workstation already using the defaults can set:

```text
POSTGRES_HOST_PORT=45432
REDIS_HOST_PORT=46379
MINIO_API_HOST_PORT=49000
MINIO_CONSOLE_HOST_PORT=49001
BACKEND_HOST_PORT=58080
WEB_HOST_PORT=53000
```

Then the web app is available at `http://localhost:53000`, while containers still communicate through `postgres:5432`, `redis:6379`, `minio:9000` and `backend:8080`. Do not rewrite those internal service addresses when resolving host-port collisions.

## Local-only bootstrap account

`.env.example` includes a local development bootstrap account so a fresh stack can exercise authentication and authorization. It is not a production credential.

```text
Email:    local.operator@nirikshanx.test
Password: Local-NX-2026-Change!
```

`SYSTEM_ADMIN` is MFA-protected. On a fresh local database, sign in, open **Account & security**, enroll TOTP, sign out, then sign in again with the authenticator code to establish an MFA-verified session and release privileged effective permissions.

Before that fresh MFA login, the System Administration workspace intentionally shows a restricted session and omits links whose permissions are currently withheld.

## Role-aware workspaces

NirikshanX does not create separate role applications. After authentication, the PWA resolves one presentation workspace from live server state:

```text
Authenticate
  → current user
  → effective roles
  → effective permissions
  → jurisdiction
  → institution membership/resource scope
  → workspace
```

Current workspace identities include System Administration, National Command Center, State Monitoring Workspace, District Operations, Inspection Operations, Mobile Inspection Workspace, Compliance Workspace and Audit & Review Workspace.

This is presentation logic only. Backend authorization remains authoritative. A workspace never manufactures a missing permission, widens jurisdiction, bypasses MFA or turns institution membership into a role.

Navigation is capability-driven and currently exposes only implemented product areas: Workspace, Institutions, Programs and Account. Inspection, evidence, risk, anomaly, CCTV, attendance, corrective-action and reporting navigation is intentionally absent until those roadmap modules exist.

## Engineering rules

- Modular monolith first; split only when runtime characteristics justify it.
- PostgreSQL + PostGIS is authoritative.
- Redis is disposable/non-authoritative.
- Flyway history is append-only after merge.
- Domain IDs use UUIDs and business timestamps use `timestamptz`.
- One responsive PWA; role-aware workspaces remain inside the same application.
- Authentication proves identity/session; authorization is database-backed and deny-by-default.
- Roles, permissions and jurisdictions do not live in the JWT.
- Membership never creates a permission; permission + resource scope are both required.
- Enrollment/project/milestone scope is inherited from the canonical parent institution.
- Inaccessible resource existence should not be disclosed through list totals or distinguishable detail responses.
- AI recommends; humans decide.
- No single GPS/photo/CCTV/attendance/AI signal is treated as absolute truth.
- Build vertical slices: schema → backend rules → API → authorization → frontend → tests → verification → docs.
- Do not create future-phase tables/screens merely as placeholders.
- No fake AI/risk/CCTV/inspection/geography/institution/scheme/project data.
- SiteProof remains a read-only donor/reference repository.

## SiteProof relationship

Reference: `sahid-code404/SiteProof`, branch `redesign/adaptive-glass-ui`.

NirikshanX reuses selected trust, evidence and visual-system concepts—not the SiteProof product architecture wholesale. See `docs/reference/siteproof-reuse-map.md`.

## Documentation

- `docs/architecture/technology-baseline.md`
- `docs/architecture/system.md`
- `docs/architecture/design-system.md`
- `docs/database/schema.md`
- `docs/security/authentication.md`
- `docs/security/authorization.md`
- `docs/domain/institutions.md`
- `docs/domain/programs.md`
- `docs/domain/workspaces.md`
- `docs/reference/siteproof-reuse-map.md`

## Verification rule

A phase is not complete merely because files exist. Before merge, branch CI and pull-request CI must pass and acceptance criteria must be exercised against the real stack.

For Phase 8 that includes deterministic role-aware workspace resolution, MFA-restricted navigation, live authorization inputs, capability-driven routes, responsive desktop/mobile shell behavior, configurable Compose host ports, and all existing Phase 1–7 database/security/domain regressions.
