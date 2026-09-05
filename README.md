# NIRIKSHANX

**SIH26095 — Trust, Monitoring, Surprise Inspection, Evidence Verification & Compliance Intelligence Platform**

NirikshanX is a scheme-agnostic monitoring and verification platform for the Department of Social Justice and Empowerment. Its central question is:

> How strongly can the Ministry trust the operational claims, inspection evidence and compliance state reported by an institution?

## Current phase

**Phases 1–6 are merged and verified on `main`.** Active development is **Phase 7 — Schemes / Projects** on branch `phase/07-schemes-projects`, tracked by Issue #13.

Implemented foundations now include:

- Next.js 16.3.3 App Router web application with strict TypeScript;
- one responsive design system with semantic light/dark tokens and accessibility primitives;
- Java 25 / Spring Boot 4.1.1 modular-monolith backend;
- PostgreSQL 18 + PostGIS 3.6.4 authoritative database;
- Redis 8.8.2 as disposable/non-authoritative infrastructure;
- pinned MinIO local object-storage process;
- Flyway migration history through V6 on the active Phase 7 branch;
- canonical State/District geography with relational constraints;
- authentication with Argon2id passwords, short-lived JWT access tokens and rotating server-side refresh sessions;
- TOTP MFA and privileged-session assurance;
- database-backed roles, granular permissions and NATIONAL/STATE/DISTRICT jurisdiction authorization;
- canonical institutions with PostGIS `geography(Point,4326)` location;
- historical institution memberships that add exact resource scope without bypassing RBAC;
- SQL-scoped institution search/list pagination so inaccessible institutions and total counts are not fetched then filtered in the browser;
- responsive institution registry, detail and create/edit workflows;
- scheme-agnostic `schemes`, `institution_scheme_enrollments`, `projects` and `project_milestones` on the active Phase 7 branch;
- canonical project parentage through an enrollment rather than duplicated unchecked institution/scheme IDs;
- granular scheme/enrollment/project/milestone permissions and institution-inherited scope;
- protected `/programs` and `/projects/{projectId}` web workflows with server-side search/pagination and responsive table/card presentation;
- real database, authorization, authentication, institution, program and browser verification gates in CI.

NirikshanX deliberately does **not** invent authoritative institution, scheme, enrollment, project or milestone status taxonomies. Policy-coded fields accept normalized constrained codes until approved government data dictionaries are selected. No fake production institutions, schemes, projects or guessed production geography are seeded.

## Quick start

Requirements: Git, Docker Engine and Docker Compose v2.

### Stable `main`

```bash
git clone git@github.com:sahid-code404/SIH-2026.git
cd SIH-2026
cp .env.example .env
docker compose up --build
```

### Active Phase 7 development

```bash
git switch phase/07-schemes-projects
cp .env.example .env
docker compose up --build
```

Then open:

```text
Web:           http://localhost:3000
Login:         http://localhost:3000/login
Institutions:  http://localhost:3000/institutions
Programs:      http://localhost:3000/programs
Backend:       http://localhost:8080
MinIO console: http://localhost:9001
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
node scripts/verify_authorization_current.mjs
node scripts/verify_institutions.mjs
node scripts/verify_programs.mjs
node scripts/verify_authentication.mjs
```

The verification scripts create isolated CI/test fixtures and clean them up. They are not production seed data.

Stop cleanly:

```bash
docker compose down
```

Remove local development data only when intentionally resetting the environment:

```bash
docker compose down -v
```

## Local-only bootstrap account

`.env.example` includes a local development bootstrap account so a fresh stack can exercise authentication and authorization. It is not a production credential.

```text
Email:    local.operator@nirikshanx.test
Password: Local-NX-2026-Change!
```

`SYSTEM_ADMIN` is MFA-protected. On a fresh local database, sign in, open **Account & security**, enroll TOTP, sign out, then sign in again with the authenticator code to establish an MFA-verified session and release privileged effective permissions.

## Engineering rules

- Modular monolith first; split only when runtime characteristics justify it.
- PostgreSQL + PostGIS is authoritative.
- Redis is disposable/non-authoritative.
- Flyway history is append-only after merge.
- Domain IDs use UUIDs and business timestamps use `timestamptz`.
- One responsive PWA; later role-aware workspaces build on the same application.
- Authentication proves identity/session; authorization is database-backed and deny-by-default.
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
- `docs/reference/siteproof-reuse-map.md`

## Verification rule

A phase is not complete merely because files exist. Before merge, branch CI and pull-request CI must pass and the phase acceptance criteria must be exercised against the real stack.

For Phase 7 that includes V6 migration success, relational scheme/enrollment/project/milestone integrity, NATIONAL/STATE/DISTRICT isolation, exact institution-membership scope without RBAC bypass, immediate membership revocation, SQL-level non-disclosing list/search/count behavior, authentication/authorization/institution regressions and responsive web regressions.
