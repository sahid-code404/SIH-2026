# System Architecture

## Implemented architecture through Phase 6

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
  |       |---- roles + permissions
  |       |---- NATIONAL / STATE / DISTRICT jurisdiction
  |       `---- live PostgreSQL permission resolution per request
  |
  |---- Institution module
  |       |---- canonical institution CRUD/search
  |       |---- SQL-scoped resource visibility
  |       `---- institution membership ownership scope
  |
  |---- PostgreSQL 18 + PostGIS 3.6  [authoritative]
  |       |---- Flyway V1..V5
  |       |---- platform_bootstrap
  |       |---- states / districts
  |       |---- users / sessions / TOTP
  |       |---- roles / permissions / jurisdictions
  |       `---- institutions / institution_memberships
  |
  |---- Redis 8.8                       [disposable/non-authoritative]
  |
  `---- S3-compatible MinIO             [local storage process; evidence integration later]
```

The product remains a modular monolith. No business capability has been split into a microservice merely for architectural appearance.

## Web application boundary

The frontend is one responsive PWA rather than separate officer/inspector/institution applications. Phase 2 established the shared semantic design system. Authentication and account-security surfaces were added in Phase 4, while Phase 6 adds the first real protected domain surface at `/institutions`.

The institution registry uses server-side search/pagination, desktop tabular presentation and mobile cards. The institution detail route exposes only the implemented overview/membership functionality. Future Institution 360 tabs are not rendered as fake placeholders.

Role-aware workspace routing is still a later phase; Phase 6 does not redesign the application into separate portals.

## Real system-status contract

`GET /api/v1/system/status` performs a real `SELECT 1` against PostgreSQL and a real Redis `PING`. It returns only component state and does not expose credentials, hosts, exceptions or stack traces.

The web application calls that backend endpoint through the same-origin Next.js route. It does not fabricate operational intelligence.

## Authoritative database boundary

PostgreSQL + PostGIS is the system of record. Redis may accelerate later workflows but cannot become the only copy of business state.

Flyway owns schema evolution. Migrations are append-only after merge.

### V1 — infrastructure bootstrap

`V1__enable_postgis_and_bootstrap.sql` confirms/enables PostGIS and creates `platform_bootstrap`.

### V2 — database core

`V2__database_core_geography.sql` establishes canonical `states` and `districts`, UUIDs, UTC `timestamptz`, strong relational constraints and database-maintained audit timestamps.

### V3 — authentication

Phase 4 introduces canonical users, refresh-session state, failed-login audit and TOTP data. Access JWTs remain short-lived and deliberately compact; refresh tokens are hashed at rest and rotated server-side.

### V4 — authorization

Phase 5 introduces roles, permissions, user-role history and NATIONAL/STATE/DISTRICT user jurisdictions. Privileged permission resolution is gated by current-session MFA assurance and remains PostgreSQL-backed rather than JWT-embedded.

### V5 — institutions

Phase 6 introduces:

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

`institutions.state_id` / `district_id` are relational. A composite FK ensures a district belongs to the supplied state.

Institution location is a real PostGIS:

```sql
geography(Point,4326)
```

with a GiST spatial index. The schema stores explicit primary-contact columns rather than a JSONB catch-all.

`institution_memberships` preserve assignment/revocation history. Active membership adds resource ownership scope only; it never grants a capability that the user's RBAC permissions do not already allow.

## Authorization decision boundary

For institution resources, the current effective decision is:

```text
allow = required permission
     && (
          matching NATIONAL/STATE/DISTRICT jurisdiction
          OR active membership in that exact institution
        )
```

Membership is a resource-scope input, not a role or permission. Government users can see institutions inside their jurisdiction; institution users can see only institutions in which they have an active membership and for which their current role grants the operation.

List/search authorization is pushed into SQL. The service does not fetch all institutions and filter them in memory. This prevents inaccessible rows and inaccessible total counts from being exposed to the caller.

Protected detail lookups use a non-disclosing visibility policy so guessed inaccessible institution IDs do not reveal whether a hidden record exists.

## Authentication/security boundary

Authentication and authorization remain separate concerns:

- passwords are Argon2id-hashed;
- access JWTs are short-lived and held in frontend runtime memory, not `localStorage`;
- refresh tokens are cookie-backed, hashed server-side, rotating and replay/reuse aware;
- current session/user validity is checked against PostgreSQL;
- roles/permissions/jurisdiction are resolved from PostgreSQL per request;
- privileged permission grants remain withheld unless MFA policy is satisfied.

Institution services repeat their own permission and resource-scope checks. Frontend visibility is convenience UX only and is never an enforcement boundary.

## Institution data-policy boundary

The master specification identifies `institution_type`, `status`, `verification_status` and primary contact, but does not supply an authoritative government taxonomy for the three code fields.

Phase 6 therefore stores normalized constrained policy codes without inventing a closed production enum. The UI asks for the approved code and explicitly avoids presenting a guessed taxonomy as authoritative.

No fake production institution seed data is shipped.

## Verification

CI builds the complete Compose stack and verifies:

- backend build/tests;
- web lint/typecheck/tests/build;
- Compose validity and health;
- PostGIS;
- database-core invariants;
- authorization/MFA/jurisdiction policy;
- institution V5 schema, PostGIS point storage and district/state consistency;
- NATIONAL/STATE/DISTRICT institution isolation;
- institution membership scope and immediate revocation;
- non-disclosing SQL search/list behavior;
- authentication/session security regressions;
- responsive browser behavior and regression screenshots.

The institution verifier uses isolated fixtures and removes them before completion. Test data is never treated as production seed data.

## PWA/object-storage boundary

The web app ships a manifest and production service-worker baseline. It deliberately does not cache backend API responses. Full offline inspection repositories, mutation queues, evidence persistence and conflict resolution belong to later offline/sync phases.

MinIO remains pinned and available as local S3-compatible infrastructure. Evidence buckets, upload authorization, independent evidence hashing and retention are later evidence phases.

## Current phase boundary

Phase 6 stops before:

- schemes, institution-scheme enrollments, projects and milestones;
- role-aware workspaces;
- inspection templates/lifecycle;
- inspector profiles/assignment;
- proof-of-presence/evidence;
- anomaly/risk engines;
- CCTV/attendance;
- corrective actions/reports/integrations.

Those capabilities are introduced only when their schema, backend rules, API, authorization, frontend, tests and verification can be implemented as a complete vertical slice.
