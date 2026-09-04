# Database Schema

PostgreSQL + PostGIS is the authoritative NirikshanX data store. Redis is not authoritative and must never be the only copy of business state.

## Migration history

| Migration | Purpose |
|---|---|
| `V1__enable_postgis_and_bootstrap.sql` | Enable PostGIS and create the infrastructure bootstrap marker. |
| `V2__database_core_geography.sql` | Establish relational database-core rules and canonical `states` / `districts` geography. |

Flyway migrations are append-only after merge. Never modify an already-deployed migration to change production schema; add a new migration instead.

## Base relational rules

Current and future domain tables follow these rules unless a documented architecture decision requires otherwise:

- domain IDs use PostgreSQL `uuid`;
- business timestamps use `timestamptz`;
- required values are `NOT NULL`;
- relationships use explicit foreign keys;
- business invariants use `UNIQUE` and `CHECK` constraints where the database can enforce them reliably;
- indexes are added for demonstrated query paths rather than indiscriminately;
- core business data is modeled relationally;
- JSONB is not a shortcut for avoiding proper business-data modeling.

`platform_bootstrap` remains infrastructure metadata only and is not a domain table.

## Canonical geography

### `states`

Purpose: canonical first-level administrative geography catalog.

| Column | Type | Null | Notes |
|---|---|---:|---|
| `id` | `uuid` | no | Primary key. |
| `code` | `varchar(32)` | no | Canonical external code. Unique, uppercase and normalized. |
| `name` | `varchar(160)` | no | Canonical display name. Trimmed and nonblank. |
| `created_at` | `timestamptz` | no | Creation timestamp. Immutable after insert. |
| `updated_at` | `timestamptz` | no | Maintained by database trigger on update. |

Additional invariants:

- `code` is unique;
- `code` permits uppercase letters, digits, `.`, `_` and `-`, which covers common official-code shapes without inventing a source-specific scheme;
- state names are case-insensitively unique through `uq_states_name_ci`;
- `updated_at >= created_at`.

### `districts`

Purpose: canonical district catalog beneath `states`.

| Column | Type | Null | Notes |
|---|---|---:|---|
| `id` | `uuid` | no | Primary key. |
| `state_id` | `uuid` | no | Required FK to `states.id`. |
| `code` | `varchar(32)` | no | Canonical external code. Unique, uppercase and normalized. |
| `name` | `varchar(160)` | no | Canonical district name. Trimmed and nonblank. |
| `created_at` | `timestamptz` | no | Creation timestamp. Immutable after insert. |
| `updated_at` | `timestamptz` | no | Maintained by database trigger on update. |

Relationship behavior:

```text
states 1 ─────────── * districts
```

`districts.state_id` uses `ON UPDATE RESTRICT` and `ON DELETE RESTRICT`. A state cannot be deleted while a district references it.

Indexes/invariants:

- district `code` is unique;
- district name is case-insensitively unique within a state through `uq_districts_state_name_ci`;
- `idx_districts_state_name` supports State → District lookup/sorting;
- `updated_at >= created_at`.

## Audit timestamp maintenance

`V2` installs `nirikshanx_maintain_audit_timestamps()` and update triggers for `states` and `districts`.

The trigger:

1. rejects attempts to mutate `created_at`;
2. replaces `updated_at` with the database wall-clock timestamp for every update.

This keeps timestamp behavior consistent even when a future data-maintenance operation bypasses application code.

## Geography data policy

The schema deliberately ships with **no guessed or partial State/District production seed data**.

`code` is intended to hold the identifier from the authoritative geography source selected for the deployment. Until that source and its versioning/update policy are explicitly selected, NirikshanX must not present a hand-built partial catalog as authoritative government geography.

Tests create temporary geography rows inside a transaction and roll them back.

Future business tables must reference `state_id` / `district_id` instead of repeating raw state or district text.

## PostGIS contract

PostGIS is enabled by `V1`. No institution table is created in Database Core because Institutions is a later vertical phase.

When the Institution phase is implemented, its location contract is:

```sql
geography(Point,4326)
```

with a spatial index appropriate for real query paths. PostGIS will support:

- distance calculations;
- geofence checks;
- nearby-inspector candidate calculation;
- map filtering.

The future spatial column/index must be introduced with the Institution migration rather than as an unused placeholder now.

## Executable verification

`scripts/verify_database_core.sql` is executed by the full-stack CI job against the real Compose PostgreSQL/PostGIS instance.

It verifies:

- both geography tables exist;
- UUID and `timestamptz` contracts;
- required indexes and timestamp triggers;
- valid State → District insertion;
- `updated_at` advances after update;
- `created_at` is immutable;
- duplicate codes fail;
- malformed/padded codes and names fail;
- case-insensitive duplicate names fail;
- missing parent states fail;
- referenced state deletion fails.

The script wraps all test fixtures in `BEGIN` / `ROLLBACK`, so CI never turns temporary verification rows into seed data.

## Explicitly not present yet

Database Core does not create:

- `users` or sessions — Authentication phase;
- roles, permissions or jurisdictions — Authorization phase;
- institutions — Institution phase;
- schemes/projects;
- inspections/evidence;
- CCTV/attendance;
- anomaly/risk tables.

Those schemas will be introduced only with their real vertical features and associated backend/API/authorization/frontend/tests.
