# Institutions

## Purpose

The Institution domain is the first protected NirikshanX business resource. It provides one canonical institution identity/location record that later schemes, projects, inspections, evidence, risk, CCTV, attendance and corrective-action modules can reference.

Phase 6 does not attempt to build the later Institution 360 experience. It implements only the institution registry, institution detail overview, canonical geography/location data, membership ownership scope and authorized CRUD/search behavior needed by later phases.

## Canonical model

`institutions` contains:

```text
id
code
legal_name
display_name
institution_type
registration_number
status
state_id
district_id
address
postal_code
location
geofence_radius_m
primary_contact_name
primary_contact_email
primary_contact_phone
verification_status
created_at
updated_at
```

`location` is PostGIS `geography(Point,4326)` and has a GiST index. State/District consistency is enforced by a composite relational FK.

The schema intentionally does not hide primary-contact data in JSONB.

## Policy-code rule

The product specification names institution type, status and verification status but does not define authoritative enumerations. Phase 6 therefore stores normalized uppercase policy codes and does not claim a guessed list is government policy.

Examples used by automated verification are test-only values such as `CI_TEST_TYPE`, `ACTIVE` and `PENDING_REVIEW`. They are not production taxonomy.

## Authorization model

Every institution operation requires the relevant current effective permission:

```text
institution.read
institution.create
institution.update
```

Resource visibility is then determined by live scope:

```text
required permission
AND
(
  NATIONAL jurisdiction
  OR matching STATE jurisdiction
  OR matching DISTRICT jurisdiction
  OR active membership in this exact institution
)
```

Membership never creates a permission. A user with membership but no appropriate RBAC grant still cannot perform the operation.

Government jurisdiction and institution membership are additive scope sources. They do not replace each other.

## Non-disclosure rule

Institution list/search is authorized in SQL. The backend does not fetch inaccessible institutions and filter them after retrieval.

This applies to both rows and totals. A search for a hidden institution returns an authorized empty result rather than a global count that reveals hidden records.

Detail lookups use a non-disclosing visibility policy: a caller outside the institution's scope receives the same not-found resource outcome used for a genuinely absent institution instead of a response that confirms hidden existence.

## Search and pagination

The registry supports bounded server-side pagination and deterministic sorting.

Search covers:

```text
institution code
legal name
display name
registration number
```

The API also accepts geography/status/type filters. Search/filter authorization remains part of the SQL query so inaccessible rows cannot enter application memory through the list path.

## Create/update rules

Create/update operations:

1. require the relevant effective permission;
2. validate normalized field shapes;
3. validate canonical State/District relationships;
4. validate latitude/longitude and positive geofence radius;
5. reject duplicate institution code and duplicate case-insensitive registration number;
6. require the caller to have scope over the target geography;
7. use explicit request DTO fields rather than generic mass assignment.

Moving an institution to a different geography requires the caller to be authorized for the destination district as well.

## Membership history

`institution_memberships` preserves assignment/revocation history:

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

Only one active membership per institution/user pair is allowed. Revocation is non-destructive and requires a reason.

Because membership is evaluated from PostgreSQL for the next request, revocation removes institution ownership scope immediately without waiting for JWT expiry.

## APIs

Registry/detail:

```text
GET    /api/v1/institutions
GET    /api/v1/institutions/{institutionId}
POST   /api/v1/institutions
PUT    /api/v1/institutions/{institutionId}
```

Membership administration:

```text
GET    /api/v1/institutions/{institutionId}/memberships
POST   /api/v1/institutions/{institutionId}/memberships
POST   /api/v1/institutions/{institutionId}/memberships/{membershipId}/revoke
```

Canonical geography lookup used by the institution UI:

```text
GET /api/v1/geography/states
GET /api/v1/geography/states/{stateId}/districts
```

## Web UX

`/institutions` provides:

- authenticated institution registry;
- loading, error and authorized-empty states;
- search and bounded pagination;
- desktop table presentation;
- mobile card presentation;
- create flow only when `institution.create` is currently effective;
- explicit messaging when privileged permissions are withheld by MFA policy.

`/institutions/{id}` provides the implemented overview/edit/membership functions only. It does not render fake Projects/Inspections/Risk/CCTV/etc. tabs before those domains exist.

Frontend permission checks are UX only. Backend services remain authoritative.

## Verification

`scripts/verify_institutions.mjs` uses the real Compose PostgreSQL/PostGIS/backend stack and validates:

- Flyway V5;
- geography type/SRID/index contracts;
- real location persistence;
- relational district/state enforcement;
- authorized create;
- NATIONAL, STATE and DISTRICT visibility boundaries;
- non-disclosing hidden detail/search;
- membership ownership scope;
- no RBAC bypass through membership;
- membership revocation taking effect immediately;
- cleanup of all isolated verifier fixtures.

Existing authentication, authorization, database and browser regressions remain mandatory after this verifier.

## Explicit non-scope

Phase 6 does not create:

- schemes or institution-scheme enrollments;
- projects or milestones;
- role-aware workspaces;
- inspection templates or inspections;
- evidence/proof-of-presence;
- risk/anomaly/CCTV/attendance/corrective actions;
- fake Institution 360 tabs;
- production demo data;
- an invented authoritative institution taxonomy.
