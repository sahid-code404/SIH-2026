# System Architecture

## Implemented architecture through Phase 3

```text
Browser
  |
  v
NirikshanX responsive Next.js PWA :3000
  | same-origin /backend-api rewrite
  v
Spring Boot modular monolith :8080
  |---- PostgreSQL 18 + PostGIS 3.6  [authoritative]
  |       |---- Flyway migration history
  |       |---- platform_bootstrap
  |       |---- states
  |       `---- districts
  |
  |---- Redis 8.8                       [disposable/non-authoritative]
  |
  `---- S3-compatible MinIO             [local storage process; evidence integration later]
```

The product remains a modular monolith. No business capability has been split into a microservice merely for architectural appearance.

## Web application boundary

The frontend is one responsive PWA rather than separate officer/inspector/institution applications. Phase 2 established the shared semantic design tokens, responsive shell, accessible interaction primitives, data/workflow patterns and reserved domain UI boundaries.

Those UI boundaries do not imply later business engines exist. Authentication, authorization, institutions, inspections, evidence, CCTV, attendance, anomaly detection and risk scoring remain absent until their own vertical phases.

## Real system-status contract

`GET /api/v1/system/status` performs a real `SELECT 1` against PostgreSQL and a real Redis `PING`. It returns only component state and does not expose credentials, hosts, exceptions or stack traces.

The web application calls that backend endpoint through the same-origin Next.js route. It does not fabricate operational intelligence.

## Authoritative database boundary

PostgreSQL + PostGIS is the system of record. Redis may accelerate later workflows but cannot become the only copy of business state.

Flyway owns schema evolution. Migrations are append-only after merge.

### V1 — infrastructure bootstrap

`V1__enable_postgis_and_bootstrap.sql`:

- enables PostGIS;
- creates `platform_bootstrap` as infrastructure metadata.

### V2 — database core

`V2__database_core_geography.sql` establishes the first canonical relational business foundation:

```text
states 1 ─────────── * districts
```

Both tables use UUID primary keys, normalized canonical external codes/names, `timestamptz` audit timestamps and database constraints. State deletion is restricted while districts reference it.

A database trigger keeps `created_at` immutable and advances `updated_at` on updates.

No guessed geography is seeded. An authoritative geography source/version policy must be selected before production catalog ingestion.

Future business tables reference geography IDs instead of duplicating raw State/District strings.

## PostGIS boundary

PostGIS is available now, but Database Core does not create an empty institution schema merely to consume it.

The later Institution phase will introduce the real institution location field as:

```sql
geography(Point,4326)
```

with a spatial index for actual distance/geofence/nearby-candidate/map queries.

## Database-core verification

CI starts the complete Compose stack, waits for real backend/web readiness, verifies PostGIS and executes `scripts/verify_database_core.sql` against PostgreSQL.

The verifier uses transaction-scoped fixtures and checks positive and negative database invariants before rolling everything back. This gives database behavior a real integration gate without introducing fake production records.

## PWA baseline

The web app ships a manifest and production service-worker baseline. The service worker deliberately does not cache backend API responses. Full offline inspection repositories, mutation queues, evidence persistence and conflict resolution belong to later offline/sync phases.

## Security boundary

Authentication is intentionally absent through Database Core. No placeholder token mechanism exists and no JWT is stored in `localStorage`.

The next Authentication phase will own users, credentials, short-lived access tokens, refresh-session rotation/revocation and login/session operations. Authorization follows as a separate phase so role/permission/jurisdiction logic is not mixed prematurely into authentication.

## Dependency reproducibility

All direct web dependencies are exact-version pinned and CI rejects semver ranges. The npm-generated `package-lock.json` captures the transitive graph. CI and the production web Docker build use `npm ci`; lifecycle scripts remain restricted through `.npmrc` and explicit `allowScripts` entries.

## Object-storage boundary

MinIO is pinned and starts locally so the storage topology is established. Evidence buckets, server-generated object keys, upload authorization, independent hash verification and retention rules are not claimed yet.

## Current phase boundary

Database Core intentionally stops before:

- users/sessions;
- roles/permissions/jurisdictions;
- institutions;
- schemes/projects;
- inspections/evidence;
- AI/CCTV/attendance/risk.

Those capabilities are added only when their data model, backend rules, API, authorization, UI, tests and verification can be implemented as a real vertical slice.
