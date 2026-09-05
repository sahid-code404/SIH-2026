# Authorization

NirikshanX authorization is a deny-by-default combination of database-backed RBAC and jurisdiction ABAC. Authentication proves who the caller is and which server session is active; authorization separately decides what that caller may do to a resource now.

## Decision model

The long-term domain decision is:

```text
allow = permission
     && jurisdiction
     && resource ownership / assignment policy
     && resource state policy
```

Phase 5 implements the reusable role/permission and NATIONAL/STATE/DISTRICT jurisdiction foundations. Institution ownership, inspection assignment, surprise-inspection disclosure, CCTV purpose/time limits and workflow-state rules are deliberately deferred until those domain resources exist. They must plug into this authorization boundary rather than bypass it.

## Authoritative state

PostgreSQL is authoritative for authorization. Access JWTs remain deliberately compact and contain only:

```text
sub, sid, jti, iss, aud, iat, exp
```

Roles, permissions and jurisdiction are never copied into the JWT. `AccessTokenFilter` validates the token and live session, then resolves the caller's current effective permissions from PostgreSQL for that request. Therefore a role revocation or permission mapping change does not wait for JWT expiry.

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

`authorization.manage` is assigned only to `SYSTEM_ADMIN`. This prevents a ministry administrator from granting itself system-administrator authority. `MINISTRY_ADMIN` can inspect authorization through `authorization.read` but cannot mutate it.

## Permission catalog

The Phase 5 catalog is version controlled in Flyway V4 and includes:

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

A permission name expresses capability only. It does not grant scope. Future domain services must combine it with jurisdiction, ownership/assignment and workflow-state checks.

## Assignment history

`user_roles` and `user_jurisdictions` preserve assignment history. Revocation sets `revoked_at`, `revoked_by_user_id` and a required reason instead of deleting the authorization fact. Partial unique indexes prevent duplicate active assignments while still permitting a later re-assignment after revocation.

The explicit local bootstrap mechanism is the only bootstrap exception. When `BOOTSTRAP_USER_ENABLED=true`, the configured local user is idempotently ensured to have `SYSTEM_ADMIN` and `NATIONAL`. Existing credentials are never silently replaced.

## Jurisdiction ABAC

`user_jurisdictions` supports exactly three scope shapes:

- `NATIONAL`: no state or district IDs.
- `STATE`: exactly one state ID and no district ID.
- `DISTRICT`: both state and district IDs.

District/state consistency is enforced relationally with a composite foreign key to `districts(id, state_id)`, not with user-supplied labels or application-only checks.

Current scope semantics:

- NATIONAL can access state-level and district-level resources anywhere.
- STATE can access state-level resources in that state and district-level resources whose district belongs to that state.
- DISTRICT can access only district-level resources for that exact district; it does not imply state-wide access.
- no applicable active jurisdiction means no scoped-resource access.

The self access-check endpoints are useful for UI preflight and testing, but future domain APIs must repeat the authoritative check inside the backend service handling the resource.

## MFA privilege gate

Privileged government/oversight roles are marked `mfa_required` in the role catalog. Permissions granted only through an MFA-required role are withheld unless both are true:

1. the account has confirmed TOTP, and
2. the current server session has MFA assurance.

A password-only session that existed before TOTP enrollment does **not** become privileged merely because the user enables TOTP while that session is open. The user must sign out and complete a fresh password + TOTP login. Sessions created after TOTP was already enabled can only be created by the existing MFA login flow, so they carry derived session assurance; `user_sessions.mfa_verified_at` is reserved for an explicit assurance timestamp when a future re-authentication flow needs to mark an existing session.

This prevents a privileged role assigned to an already-open password-only session from silently becoming usable.

## Spring Security boundary

`AccessTokenFilter` performs these steps on each bearer-authenticated request:

1. validate the JWT signature/issuer/audience/expiry;
2. verify the user is active and the server session is current and not revoked;
3. determine current-session MFA assurance;
4. resolve effective permission codes from active `user_roles` + `role_permissions` + `permissions`;
5. attach only permission authorities to Spring Security.

Method security is enabled. Authorization-administration endpoints use `@PreAuthorize` with granular permissions such as `authorization.read` and `authorization.manage`.

Future domain code should use permission names and the authorization service's scope helpers. Role codes are metadata, not enforcement primitives.

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

The catalog and user-context administration reads require `authorization.read`. Mutations require `authorization.manage`. The final active `SYSTEM_ADMIN` cannot be revoked.

## Error and disclosure policy

Unauthenticated access returns `401`. Authenticated callers that lack an effective permission receive `403` using the existing request-ID-correlated API error shape. Domain services must not use authorization errors to reveal hidden resource existence; where resource visibility itself is protected, the resource service should apply the appropriate non-disclosing response policy.

## Verification

`scripts/verify_authorization.mjs` runs against the real Compose PostgreSQL-backed stack and verifies:

- Flyway V4 and deterministic role/permission catalogs;
- explicit bootstrap `SYSTEM_ADMIN` + NATIONAL scope;
- compact JWT claims with no role/permission/jurisdiction payload;
- privileged permissions withheld before MFA;
- TOTP enrollment does not silently elevate an old password-only session;
- a fresh MFA login releases privileged permissions;
- district/state relational consistency;
- NATIONAL, STATE and DISTRICT positive and negative boundaries;
- immediate role revocation and restoration on the same unexpired JWT;
- cleanup back to the fresh authentication-regression contract.

The existing authentication, database-core, browser, design-system and system-health verification remains mandatory in CI.
