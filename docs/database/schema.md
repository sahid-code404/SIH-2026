# Database Schema

PostgreSQL + PostGIS is the authoritative NirikshanX data store. Redis is non-authoritative and must never be the only copy of business state.

## Migration runtime

Spring Boot 4 uses its dedicated Flyway starter plus Flyway's PostgreSQL database module. The local/CI PostGIS image may initialize the PostGIS extension before the application starts; V1 uses `CREATE EXTENSION IF NOT EXISTS postgis`, so that is harmless and does not replace Flyway application history.

No Flyway baseline marker is configured or required. Fresh environments apply V1 through the current head normally.

## Migration history

| Migration | Purpose |
|---|---|
| `V1__enable_postgis_and_bootstrap.sql` | Confirm/enable PostGIS and create infrastructure bootstrap metadata. |
| `V2__database_core_geography.sql` | Canonical `states` / `districts`, relational geography and audit-timestamp trigger. |
| `V3__authentication_core.sql` | Users, server-side refresh sessions, failed-login audit and TOTP authentication state. |
| `V4__authorization_core.sql` | Roles, permissions, role grants and NATIONAL/STATE/DISTRICT user jurisdictions. |
| `V5__institutions.sql` | Canonical institutions, PostGIS location/geofence contract and historical institution memberships. |

Flyway migrations are append-only after merge.

## Base relational rules

Current and future domain tables follow these rules unless a documented architecture decision requires otherwise:

- domain IDs use PostgreSQL `uuid`;
- business timestamps use `timestamptz`;
- required values use `NOT NULL`;
- relationships use explicit foreign keys;
- database-enforceable invariants use `UNIQUE` and `CHECK` constraints;
- indexes target demonstrated query paths;
- business data is modeled relationally rather than hidden in generic JSONB;
- audit `created_at` values are immutable where the shared audit trigger applies.

## Canonical geography

`states` and `districts` were introduced by V2. District rows reference their parent state, and V4 also adds a composite uniqueness contract on `districts(id, state_id)` so later business tables can enforce district/state consistency relationally.

No guessed or partial production geography is seeded. Official State/District identifiers must come from an approved authoritative source.

## Authentication and authorization data

V3 and V4 introduce the security-state tables used by the live authentication/authorization modules. Access JWTs do not become the authoritative copy of roles, permissions, jurisdiction or session revocation state.

Important design properties:

- password hashes are stored only as password hashes;
- refresh-token material is stored as hashes in server-side sessions;
- role and jurisdiction assignment/revocation history is preserved;
- role permissions are explicit relational grants;
- privileged MFA policy is represented in the role/session-assurance model;
- current authorization remains queryable from PostgreSQL on each request.

Detailed security behavior is documented in `docs/security/authentication.md` and `docs/security/authorization.md`.

## V5 canonical institutions

### `institutions`

Purpose: one canonical institution record used by later scheme, project, inspection, evidence, risk, CCTV, attendance and corrective-action domains.

| Column | Type | Null | Notes |
|---|---|---:|---|
| `id` | `uuid` | no | Primary key. |
| `code` | `varchar(64)` | no | Globally unique normalized uppercase institution code. |
| `legal_name` | `varchar(240)` | no | Trimmed legal name. |
| `display_name` | `varchar(200)` | no | Trimmed display name. |
| `institution_type` | `varchar(64)` | no | Normalized policy code; closed taxonomy intentionally not invented. |
| `registration_number` | `varchar(120)` | yes | Optional; case-insensitively unique when present. |
| `status` | `varchar(64)` | no | Normalized policy/lifecycle code; closed taxonomy deferred to authoritative policy. |
| `state_id` | `uuid` | no | FK to canonical state. |
| `district_id` | `uuid` | no | Composite FK with `state_id` to canonical district/state pair. |
| `address` | `varchar(500)` | no | Trimmed address text. |
| `postal_code` | `varchar(20)` | no | Trimmed postal code. |
| `location` | `geography(Point,4326)` | no | Canonical WGS84 institution point. |
| `geofence_radius_m` | `integer` | no | Positive geofence radius in metres. |
| `primary_contact_name` | `varchar(160)` | no | Explicit contact field. |
| `primary_contact_email` | `varchar(320)` | yes | Lowercase normalized when present. |
| `primary_contact_phone` | `varchar(32)` | yes | Trimmed when present. |
| `verification_status` | `varchar(64)` | no | Normalized policy code; closed taxonomy intentionally deferred. |
| `created_at` | `timestamptz` | no | Immutable creation timestamp. |
| `updated_at` | `timestamptz` | no | Maintained by shared audit trigger. |

### Geography integrity

The institution schema does not trust a client-supplied district/state pairing. It uses:

```text
(state_id)                 -> states(id)
(district_id, state_id)    -> districts(id, state_id)
```

Therefore a district cannot be attached to an institution under the wrong state even if application validation is bypassed.

### PostGIS contract

`location` is a real PostGIS geography point:

```sql
geography(Point,4326)
```

V5 also enforces valid longitude/latitude ranges and creates:

```text
idx_institutions_location  USING GIST(location)
```

This is the foundation for later real distance/geofence/nearby/map queries; Phase 6 does not fake those later domain features.

### Institution query indexes

V5 includes indexes for actual Phase 6 access/search patterns:

- `(state_id, district_id, display_name, id)` for scoped registry queries;
- lowercase code, display name and legal name search indexes;
- lowercase registration-number search index;
- case-insensitive unique registration number when present;
- GiST location index.

## `institution_memberships`

Membership is a historical resource-scope association between a user and an institution. It is **not** a permission grant.

Important columns:

```text
id
institution_id
user_id
assigned_by_user_id
assignment_source
assigned_at
revoked_at
revoked_by_user_id
revocation_reason
```

Important invariants:

- FK to institution and users;
- actor FKs for assignment/revocation where present;
- active duplicate membership is prevented by a partial unique index on `(institution_id, user_id)` where `revoked_at IS NULL`;
- revocation is historical/non-destructive and requires a reason;
- active user/institution lookup and assignment-history indexes are present;
- deleting referenced institutions/users is restricted rather than silently erasing history.

Authorization still requires the relevant RBAC permission. Active membership only contributes exact-institution ownership scope.

## Policy-code handling

The master product specification names `institution_type`, `status` and `verification_status` but does not provide authoritative enumerations. V5 therefore constrains them to normalized uppercase policy-code syntax without hardcoding guessed government values.

This is intentional. A later approved data dictionary can be introduced with its own versioned catalog/migration instead of rewriting historical V5 semantics.

## Executable verification

Full-stack CI executes the database/security verification against the real Compose PostgreSQL/PostGIS instance.

`scripts/verify_database_core.sql` verifies V1/V2 relational and timestamp invariants.

`scripts/verify_authorization.mjs` verifies V4 role/permission/jurisdiction behavior and MFA gating.

`scripts/verify_institutions.mjs` verifies, among other things:

- successful Flyway V5;
- institution and membership tables exist;
- `location` is PostGIS `geography(Point,4326)`, not geometry;
- SRID 4326 and GiST location index;
- real point/geofence persistence;
- database-level district/state mismatch rejection;
- NATIONAL/STATE/DISTRICT institution visibility boundaries;
- non-disclosing inaccessible detail/search behavior;
- membership ownership scope without permission bypass;
- immediate membership revocation;
- isolated fixture cleanup.

`scripts/verify_authentication.mjs` runs after the institution verifier to ensure Phase 6 leaves authentication/session state compatible with the existing fresh-stack security contract.

## Not present yet

V5 intentionally stops before:

- schemes / institution-scheme enrollments;
- projects / milestones;
- inspection templates/lifecycle;
- inspector profiles/assignments;
- evidence/proof-of-presence;
- anomaly/risk;
- CCTV/attendance;
- corrective actions/reports/integrations.

Those schemas are introduced only with their real vertical features.
