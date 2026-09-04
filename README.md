# NIRIKSHANX

**SIH26095 — Trust, Monitoring, Surprise Inspection, Evidence Verification & Compliance Intelligence Platform**

NirikshanX is a scheme-agnostic monitoring and verification platform for the Department of Social Justice and Empowerment. Its central question is:

> How strongly can the Ministry trust the operational claims, inspection evidence and compliance state reported by an institution?

## Current phase

**Foundation is merged into `main`.** Active development is **Phase 2 — Design System** on branch `phase/02-design-system`, tracked by Issue #3.

Foundation implemented and verified:

- Next.js 16.3.3 App Router web application with strict TypeScript and Tailwind baseline;
- minimal PWA manifest + service worker baseline;
- Java 25 / Spring Boot 4.1.1 modular-monolith backend;
- PostgreSQL 18 + PostGIS 3.6.4 local database topology;
- Redis 8.8.2 as non-authoritative infrastructure;
- pinned MinIO local object-storage process;
- Flyway database bootstrap enabling PostGIS;
- real backend database + Redis connectivity endpoint;
- Actuator liveness/readiness probes;
- web smoke endpoint and same-origin backend routing;
- Docker Compose orchestration;
- exact direct web dependency pins plus committed transitive npm lockfile;
- deterministic `npm ci` in CI and the production web image;
- CI for backend build/test, web lint/typecheck/build, Compose validation and full-stack integration smoke.

Phase 2 currently adds the first real design-system slice: semantic light/dark tokens, responsive shell primitives, accessible focus and skip-link behavior, reduced-motion handling, buttons/forms/status/notice primitives, and a component-review surface backed only by the real foundation health contract.

Not implemented yet: authentication, authorization, institutions, inspections, evidence, AI, CCTV, attendance, risk scoring or demo intelligence. No fake values should imply otherwise.

## Quick start

Requirements: Git, Docker Engine and Docker Compose v2.

### Stable merged foundation

```bash
git clone git@github.com:sahid-code404/SIH-2026.git
cd SIH-2026
cp .env.example .env
docker compose up --build
```

### Active Phase 2 development

```bash
git switch phase/02-design-system
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

Expected system-status shape:

```json
{
  "service": "nirikshanx-backend",
  "status": "UP",
  "components": {
    "database": { "status": "UP" },
    "redis": { "status": "UP" }
  }
}
```

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
- One responsive PWA with role-aware workspaces as those roles are implemented.
- AI recommends; humans decide.
- No single GPS/photo/CCTV/attendance/AI signal is treated as absolute truth.
- Build vertical slices: schema → backend rules → API → authorization → frontend → tests → verification → docs.
- No fake AI/risk/CCTV/inspection data.
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

A phase is not complete merely because files exist. Before a phase is merged, its CI must pass and its acceptance criteria must be exercised. Phase 2 additionally requires rendered desktop/mobile visual review and accessibility-oriented interaction review before Issue #3 can be closed.
