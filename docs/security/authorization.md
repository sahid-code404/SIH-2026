# Authorization

NirikshanX authorization is a deny-by-default combination of database-backed RBAC, jurisdiction ABAC and domain resource scope. Authentication proves who the caller is and which server session is active; authorization separately decides what that caller may do to a resource now.

## Decision model

The domain decision is:

```text
allow = permission
     && jurisdiction / ownership / assignment scope
     && resource state policy where applicable
```

Phase 5 established reusable role/permission and NATIONAL/STATE/DISTRICT jurisdiction foundations. Phase 6 is the first real domain integration of that model: institution resources combine live RBAC permission with government jurisdiction or exact-institution membership scope.

Later inspection assignment, surprise-inspection disclosure, CCTV purpose/time limits and workflow-state rules must plug into the same authorization boundary rather than bypass it.

## Authoritative state

PostgreSQL is authoritative for authorization. Access JWTs remain deliberately compact and contain only:

```text
sub, sid, jti, iss, aud, iat, exp
```

Roles, permissions, jurisdiction and institution memberships are never copied into the JWT. `AccessTokenFilter` validates the token and live session, then resolves the caller's current effective permissions from PostgreSQL for that request.

Frontend access tokens remain runtime-memory-only. Authorization data returned to the UI is informational and must never be trusted as a backend enforcement decision.

## Roles

The system-defined catalog is:

| Role | MFA required | Purpose |
| --- | --- | --- |
| `SYSTEM_ADMIN` | Yes | Platform security and authorization administration |
| `MINISTRY_ADMIN` | Yes | National ministry administration; no authorization mutation authority |
| `MINISTRY_OFFICER` | Yes | National monitoring and compliance work |
| `STATE_OFFICER` | Yes | State-scoped monitoring and compliance work |
| `DISTRICT_OFFICER` | Yes | District-scoped monitoring and compliance work |
| `INSPECTION_SUPERVISOR` | Yes | Inspection assignment/review supervision |
| `INSPECTOR` | No by default | Assigned field inspection and evidence capture |
| `INSTITUTION_ADMIN` | No by default | Authorized institution administration |
| `INSTITUTION_OPERATOR` | No by default | Authorized institution operations |
| `AUDITOR` | Yes | Read-only oversight subject to jurisdiction |

There is no implicit role hierarchy. Every role receives explicit rows in `role_permissions`. Business code must not contain `role == "ADMIN"`, `ROLE_*` shortcuts, or assumptions that one role automatically inherits another.

`authorization.manage` is assigned only to `SYSTEM_ADMIN`. `MINISTRY_ADMIN` can inspect authorization through `authorization.read` but cannot mutate it.

## Permission catalog

The catalog includes:

```text
institution.read
institution.create
institution.update
inspection.read
inspection.create
inspection.assign
inspection.perform
inspection.review
evidence.read
evidence.capture
evidence.verify
risk.read
risk.configure
anomaly.read
anomaly.review
cctv.read
cctv.manage
cctv.live_view
attendance.read
attendance.submit
corrective_action.read
corrective_action.create
corrective_action.respond
corrective_action.verify
report.read
report.export
audit.read
authorization.read
authorization.manage
```

A permission expresses capability only. It does not grant resource scope.

## Assignment history

`user_roles` and `user_jurisdictions` preserve assignment history. Revocation sets `revoked_at`, `revoked_by_user_id` and a required reason instead of deleting the authorization fact. Partial unique indexes prevent duplicate active assignments while still permitting later re-assignment.

The explicit local bootstrap mechanism is the only bootstrap exception. When `BOOTSTRAP_USER_ENABLED=true`, the configured local user is idempotently ensured to have `SYSTEM_ADMIN` and `NATIONAL`. Existing credentials are never silently replaced.

## Jurisdiction ABAC

`user_jurisdictions` supports exactly three scope shapes:

- `NATIONAL`: no state or district IDs.
- `STATE`: exactly one state ID and no district ID.
- `DISTRICT`: both state and district IDs.

District/state consistency is enforced relationally with a composite foreign key to `districts(id, state_id)`.

Current scope semantics:

- NATIONAL can access resources anywhere when the required permission is effective.
- STATE can access institution/district resources in that state.
- DISTRICT can access institution/district resources for that exact district only.
- no applicable active jurisdiction means no government-jurisdiction scope.

The self access-check endpoints are useful for UI preflight/testing, but domain APIs repeat authoritative scope checks inside their backend service/repository path.

## Institution membership scope

Phase 6 adds `institution_memberships` as a resource ownership/access association.

Membership is **not** a role and does **not** grant any permission. It only contributes exact-institution scope.

For institution reads/updates the effective resource rule is:

```text
required institution permission
AND
(
  matching NATIONAL/STATE/DISTRICT jurisdiction
  OR active membership for this exact institution
)
```

Examples:

- an `INSTITUTION_ADMIN` with `institution.read` and membership in Institution A can read Institution A;
- the same user cannot read Institution B without membership/jurisdiction scope;
- a user with Institution A membership but no `institution.read` still cannot read Institution A;
- revoking membership removes that ownership scope on the next request without waiting for JWT expiry.

For institution creation, membership cannot authorize a resource that does not yet exist. The caller therefore needs `institution.create` plus government geography scope over the destination district.

When an institution's geography is changed, the caller must also have government scope over the destination district.

## SQL-level visibility and non-disclosure

Institution list/search authorization is pushed into SQL. Inaccessible rows are not loaded and filtered later in application memory.

This is important for both data rows and metadata such as `total` counts. A district-scoped user searching for an institution outside the district receives an empty authorized result rather than a total count that reveals hidden existence.

Protected institution detail lookup uses a non-disclosing policy: inaccessible institution IDs resolve through the same resource-not-found outcome used for an absent record rather than returning a distinguishable `403` that confirms the record exists.

Permission absence remains a normal `403`, because the caller lacks the capability itself rather than merely lacking visibility to a particular protected resource.

## MFA privilege gate

Privileged government/oversight roles are marked `mfa_required`. Permissions granted only through an MFA-required role are withheld unless both are true:

1. the account has confirmed TOTP; and
2. the current server session has MFA assurance.

A password-only session that existed before TOTP enrollment does not become privileged merely because the user enables TOTP while that session is open. The user must sign out and complete a fresh password + TOTP login.

This prevents a privileged role assigned to an already-open password-only session from silently becoming usable.

## Spring Security boundary

`AccessTokenFilter` performs these steps on each bearer-authenticated request:

1. validate JWT signature/issuer/audience/expiry;
2. verify the user and server session are active/current;
3. determine current-session MFA assurance;
4. resolve effective permission codes from active database grants;
5. attach only permission authorities to Spring Security.

Method security is enabled. Authorization-administration endpoints use granular authorities such as `authorization.read` and `authorization.manage`.

Domain services then apply resource-specific scope rules. Frontend hiding/showing of buttons is not an authorization boundary.

## APIs

Self-service authorization context:

```text
GET /api/v1/authz/me
GET /api/v1/authz/me/access/states/{stateId}
GET /api/v1/authz/me/access/districts/{districtId}
```

Authorization administration:

```text
GET  /api/v1/authz/catalog/roles
GET  /api/v1/authz/catalog/permissions
GET  /api/v1/authz/users?query=...
GET  /api/v1/authz/users/{userId}
POST /api/v1/authz/users/{userId}/roles
POST /api/v1/authz/users/{userId}/roles/{roleCode}/revoke
POST /api/v1/authz/users/{userId}/jurisdictions
POST /api/v1/authz/users/{userId}/jurisdictions/{assignmentId}/revoke
```

Institution domain endpoints are documented separately in `docs/domain/institutions.md` and enforce both capability and resource scope.

## Error and disclosure policy

Unauthenticated access returns `401`. Authenticated callers that lack an effective permission receive `403` using the request-ID-correlated API error shape.

Where resource visibility itself is protected, domain services use a non-disclosing resource outcome rather than confirming hidden existence. Institution detail is the first implemented example of that policy.

## Verification

`scripts/verify_authorization.mjs` runs against the real Compose PostgreSQL-backed stack and verifies:

- Flyway V4 and deterministic role/permission catalogs;
- explicit bootstrap `SYSTEM_ADMIN` + NATIONAL scope;
- compact JWT claims with no role/permission/jurisdiction payload;
- privileged permissions withheld before MFA;
- TOTP enrollment does not silently elevate an old password-only session;
- a fresh MFA login releases privileged permissions;
- district/state relational consistency;
- NATIONAL, STATE and DISTRICT positive/negative boundaries;
- immediate role revocation/restoration on the same unexpired JWT;
- cleanup back to the authentication-regression contract.

`scripts/verify_institutions.mjs` extends that boundary with real domain-resource checks:

- NATIONAL/STATE/DISTRICT institution visibility;
- exact-institution membership scope;
- membership without permission cannot bypass RBAC;
- membership revocation affects the next request;
- hidden institution detail/search remains non-disclosing.

Existing authentication, database-core, browser and system-health verification remains mandatory in CI.
