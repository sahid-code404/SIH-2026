# NIRIKSHANX

**SIH26095 — Trust, Monitoring, Surprise Inspection, Evidence Verification & Compliance Intelligence Platform**

NirikshanX is a scheme-agnostic monitoring and verification platform for the Department of Social Justice and Empowerment. Its central question is:

> How strongly can the Ministry trust the operational claims, inspection evidence and compliance state reported by an institution?

## Current phase

**Foundation and Phase 2 Design System are merged into `main`.** Active development is **Phase 3 — Database Core** on branch `phase/03-database-core`, tracked by Issue #5.

Merged and verified foundations include:

- Next.js 16.3.3 App Router web application with strict TypeScript and Tailwind baseline;
- one responsive design-system shell with semantic light/dark tokens and accessibility primitives;
- Java 25 / Spring Boot 4.1.1 modular-monolith backend;
- PostgreSQL 18 + PostGIS 3.6.4 authoritative local database topology;
- Redis 8.8.2 as non-authoritative infrastructure;
- pinned MinIO local object-storage process;
- Flyway migration bootstrap enabling PostGIS;
- real backend database + Redis connectivity endpoint;
- Actuator liveness/readiness probes;
- web smoke endpoint and same-origin backend routing;
- Docker Compose orchestration;
- deterministic `npm ci` and full CI regression gates;
- desktop/mobile browser smoke and render evidence.

Phase 3 introduces the first domain-grade relational database core: canonical `states` / `districts`, UUID identifiers, normalized canonical codes/names, explicit FK/UNIQUE/CHECK constraints, database-maintained audit timestamps and executable schema verification against the real Compose PostgreSQL instance.

No guessed or partial production geography is seeded. Authentication, authorization, institutions, inspections, evidence, AI, CCTV, attendance and risk scoring remain intentionally absent until their own vertical phases.

## Quick start

Requirements: Git, Docker Engine and Docker Compose v2.

### Stable `main`

```bash
git clone git@github.com:sahid-code404/SIH-2026.git
cd SIH-2026
cp .env.example .env
docker compose up --build
```

### Active Phase 3 development

```bash
git switch phase/03-database-core
cp .env.example .env
docker compose up --build
```

Then open:

```text
Web:           http://localhost:3000
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

On the Phase 3 branch, verify the database-core constraints against the running Compose database:

```bash
docker compose exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/verify_database_core.sql
```

The verification runs temporary State/District fixtures inside a transaction and rolls them back.

Stop cleanly:

```bash
docker compose down
```

Remove local development data only when intentionally resetting the environment:

```bash
docker compose down -v
```

## Engineering rules

- Modular monolith first; split only when runtime characteristics justify it.
- PostgreSQL + PostGIS is authoritative.
- Redis is disposable/non-authoritative.
- Flyway history is append-only after merge.
- Domain IDs use UUIDs and business timestamps use `timestamptz`.
- One responsive PWA with role-aware workspaces as those roles are implemented.
- AI recommends; humans decide.
- No single GPS/photo/CCTV/attendance/AI signal is treated as absolute truth.
- Build vertical slices: schema → backend rules → API → authorization → frontend → tests → verification → docs.
- Do not create future-phase tables/screens merely as placeholders.
- No fake AI/risk/CCTV/inspection/geography data.
- SiteProof remains a read-only donor/reference repository.

## SiteProof relationship

Reference: `sahid-code404/SiteProof`, branch `redesign/adaptive-glass-ui`.

NirikshanX reuses selected trust, evidence and visual-system concepts—not the SiteProof product architecture wholesale. See `docs/reference/siteproof-reuse-map.md`.

## Documentation

- `docs/architecture/technology-baseline.md`
- `docs/architecture/system.md`
- `docs/architecture/design-system.md`
- `docs/database/schema.md`
- `docs/reference/siteproof-reuse-map.md`

## Verification rule

A phase is not complete merely because files exist. Before a phase is merged, branch CI and pull-request CI must pass and the phase acceptance criteria must be exercised against the real stack. Database Core specifically requires the Flyway migration and transactional constraint verifier to pass on PostgreSQL/PostGIS without persisting test geography.
