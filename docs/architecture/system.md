# System Architecture

## Implemented architecture through active Phase 7

```text
Browser
  |
  v
NirikshanX responsive Next.js PWA :3000
  | same-origin /backend-api rewrite
  v
Spring Boot modular monolith :8080
  |---- Authentication module
  |       |---- Argon2id credentials
  |       |---- short-lived JWT access tokens
  |       |---- rotating refresh sessions
  |       `---- TOTP MFA / session assurance
  |
  |---- Authorization module
  |       |---- roles + granular permissions
  |       |---- NATIONAL / STATE / DISTRICT jurisdiction
  |       `---- live PostgreSQL permission resolution per request
  |
  |---- Institution module
  |       |---- canonical institution CRUD/search
  |       |---- SQL-scoped resource visibility
  |       `---- institution membership ownership scope
  |
  |---- Program module
  |       |---- scheme catalog
  |       |---- institution scheme enrollments
  |       |---- scoped projects
  |       `---- ordered project milestones
  |
  |---- PostgreSQL 18 + PostGIS 3.6  [authoritative]
  |       |---- Flyway V1..V6
  |       |---- geography / identity / authorization
  |       |---- institutions / memberships
  |       `---- schemes / enrollments / projects / milestones
  |
  |---- Redis 8.8                       [disposable/non-authoritative]
  |
  `---- S3-compatible MinIO             [local storage process; evidence integration later]
```

The product remains a modular monolith. No business capability is split into a microservice merely for architectural appearance.

## Web application boundary

The frontend is one responsive PWA rather than separate officer/inspector/institution applications. Phase 2 established the shared semantic design system, Phase 4 added authentication/account security, Phase 6 introduced `/institutions`, and active Phase 7 adds `/programs` plus `/projects/{projectId}`.

The program registry uses server-side search/pagination, desktop tables and mobile cards. Institution details surface only real accessible scheme enrollments/projects. Project detail surfaces only the implemented overview, schedule and milestones. Future inspection/risk/CCTV/attendance/corrective-action sections are not rendered as fake placeholders.

Role-aware workspace routing is the next roadmap phase; Phase 7 still uses one coherent application rather than separate portals.

## Real system-status contract

`GET /api/v1/system/status` performs a real `SELECT 1` against PostgreSQL and a real Redis `PING`. It returns only component state and does not expose credentials, hosts, exceptions or stack traces.

The web application calls that backend endpoint through the same-origin Next.js route. It does not fabricate operational intelligence.

## Authoritative database boundary

PostgreSQL + PostGIS is the system of record. Redis may accelerate later workflows but cannot become the only copy of business state. Flyway owns append-only schema evolution after merge.

### V1 — infrastructure bootstrap

`V1__enable_postgis_and_bootstrap.sql` confirms/enables PostGIS and creates `platform_bootstrap`.

### V2 — database core

`V2__database_core_geography.sql` establishes canonical `states` and `districts`, UUIDs, UTC `timestamptz`, strong relational constraints and database-maintained audit timestamps.

### V3 — authentication

Canonical users, refresh-session state, authentication events and TOTP data. Access JWTs remain short-lived and compact; refresh tokens are hashed at rest and rotated server-side.

### V4 — authorization

Roles, permissions, user-role history and NATIONAL/STATE/DISTRICT jurisdictions. Privileged permission resolution is gated by current-session MFA assurance and remains PostgreSQL-backed rather than JWT-embedded.

### V5 — institutions

```text
states 1 ───── * institutions * ───── 1 districts
                         |
                         *
                         |
              institution_memberships
                         |
                         *
                       users
```

Institution location uses real `geography(Point,4326)` plus a GiST index. Composite relational constraints ensure the supplied district belongs to the supplied state. Active membership adds exact-institution resource scope only; it never grants a missing capability.

### V6 — schemes / projects

```text
schemes
   |
   *
institution_scheme_enrollments * ---- 1 institutions
   |
   *
projects
   |
   *
project_milestones
```

The project stores `enrollment_id` as its canonical parent. It does not duplicate unchecked `institution_id` and `scheme_id`, so a project cannot claim a scheme/institution pair inconsistent with its enrollment.

One institution cannot hold two active enrollments in the same scheme. Milestone sequence is positive and unique within a project. Status/type-like policy values remain normalized constrained codes rather than guessed closed government taxonomies.

## Authorization decision boundary

For institution-bound resources, including Phase 7 enrollments/projects/milestones, the effective decision is:

```text
allow = required permission
     && (
          matching NATIONAL/STATE/DISTRICT jurisdiction
          OR active membership in that exact institution
        )
```

Membership is a resource-scope input, not a role or permission. A user with membership but without `project.read`, for example, cannot read a project.

Scheme catalog resources are global and permission-scoped. Enrollment/project/milestone visibility inherits the parent institution scope. SQL list/search queries apply the resource predicate before rows or counts are returned; hidden records are not fetched and filtered in browser memory.

Protected detail lookups use non-disclosing behavior so a guessed inaccessible enrollment/project/milestone ID does not reveal hidden parent resource existence.

## Authentication/security boundary

Authentication and authorization remain separate concerns:

- passwords are Argon2id-hashed;
- access JWTs are short-lived and held in frontend runtime memory, not `localStorage`;
- refresh tokens are cookie-backed, hashed server-side, rotating and replay/reuse aware;
- current session/user validity is checked against PostgreSQL;
- roles/permissions/jurisdiction are resolved from PostgreSQL per request;
- privileged permission grants remain withheld unless MFA policy is satisfied.

Institution and program services enforce their own permission/resource-scope rules. Frontend element visibility is convenience UX only and never an enforcement boundary.

## Policy-data boundary

The master specification requires scheme-agnostic entities but does not supply authoritative production catalogs for institution type/status, scheme status, enrollment status, project status or milestone status.

NirikshanX therefore stores normalized constrained policy codes without presenting a guessed enum as government policy. Authoritative dictionaries/integrations can be introduced from approved sources later without embedding one scheme's columns into the shared model.

No fake production institutions, schemes or projects are seeded.

## Verification

CI builds the complete Compose stack and verifies:

- backend build/tests;
- web lint/typecheck/tests/build;
- Compose validity and health;
- PostGIS;
- database-core invariants;
- additive authorization/MFA/jurisdiction policy;
- institution V5 schema/PostGIS/scoped access;
- Phase 7 V6 relational integrity;
- scheme/enrollment/project/milestone capabilities;
- NATIONAL/STATE/DISTRICT isolation for institution-bound program data;
- exact membership scope without RBAC bypass;
- immediate membership revocation;
- non-disclosing SQL search/list/detail behavior;
- authentication/session security regressions;
- responsive browser behavior and regression screenshots.

All integration verifiers use isolated fixtures and remove them before the next verification stage. Test data is not production seed data.

## PWA/object-storage boundary

The web app ships a manifest and production service-worker baseline. It deliberately does not cache backend API responses. Full offline inspection repositories, mutation queues, evidence persistence and conflict resolution belong to later offline/sync phases.

MinIO remains pinned and available as local S3-compatible infrastructure. Evidence buckets, upload authorization, independent evidence hashing and retention are later evidence phases.

## Current phase boundary

Phase 7 stops before:

- role-aware workspaces;
- inspection templates/lifecycle;
- inspector profiles/assignment;
- proof-of-presence/evidence;
- anomaly/risk engines;
- CCTV/attendance;
- corrective actions/reports/integrations;
- scheme-specific dynamic form policy unless explicitly introduced by a later source-backed requirement.

Those capabilities are introduced only when their schema, backend rules, API, authorization, frontend, tests and verification can be implemented as a complete vertical slice.
