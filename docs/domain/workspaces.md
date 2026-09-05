# Role-aware workspaces

NirikshanX uses one responsive PWA and one authentication entry point. A workspace is a presentation and navigation view over the caller's current server-side authorization context; it is not a second authorization system and it never widens backend access.

## Resolution chain

The product resolves the landing workspace from live state in this order:

```text
Authenticate
  → current user
  → effective roles
  → effective permissions
  → jurisdiction
  → institution membership / resource scope
  → workspace presentation
```

The frontend obtains the current role, permission and jurisdiction context from `GET /api/v1/authz/me`. Roles and permissions are not embedded in the JWT. Resource APIs still enforce capability and scope independently of what navigation the browser renders.

## Workspace mapping

The current presentation mapping is:

| Role | Workspace |
| --- | --- |
| `SYSTEM_ADMIN` | System Administration |
| `MINISTRY_ADMIN` | National Command Center |
| `MINISTRY_OFFICER` | National Command Center |
| `STATE_OFFICER` | State Monitoring Workspace |
| `DISTRICT_OFFICER` | District Operations |
| `INSPECTION_SUPERVISOR` | Inspection Operations |
| `INSPECTOR` | Mobile Inspection Workspace |
| `INSTITUTION_ADMIN` | Compliance Workspace |
| `INSTITUTION_OPERATOR` | Compliance Workspace |
| `AUDITOR` | Audit & Review Workspace |

A user can hold multiple roles. NirikshanX therefore chooses one deterministic landing-workspace identity using an explicit presentation precedence. That choice does not remove other effective permissions and does not grant any capability that the backend did not return.

The current precedence is:

```text
SYSTEM_ADMIN
MINISTRY_ADMIN
MINISTRY_OFFICER
STATE_OFFICER
DISTRICT_OFFICER
INSPECTION_SUPERVISOR
AUDITOR
INSTITUTION_ADMIN
INSTITUTION_OPERATOR
INSPECTOR
```

This ordering is a UI decision only. It is intentionally separate from RBAC; there is no implicit role hierarchy.

## Navigation

Primary navigation contains only implemented product routes for which the current session has an effective read capability:

- **Workspace** — always available after authentication.
- **Institutions** — requires `institution.read`.
- **Programs** — appears when at least one implemented scheme/enrollment/project/milestone read permission is effective.
- **Account** — always available to the signed-in user.

The application does not show placeholder navigation for inspections, evidence, risk, anomaly, CCTV, attendance, corrective actions or reporting before those modules are implemented.

Hiding a link is only a usability decision. Direct URLs and every protected API remain subject to backend authorization.

## MFA-restricted sessions

A privileged role can exist while its permissions are withheld by MFA policy. That state is represented explicitly:

- the role remains visible in authorization context;
- withheld capabilities do not appear in permission-driven navigation;
- the workspace shows a restricted-session notice;
- no privileged metric or action is fabricated;
- the user is directed to Account & security to enroll TOTP when necessary;
- after enrollment, a fresh password + TOTP login is required to establish MFA session assurance.

This preserves the Phase 5 rule that enabling TOTP inside an already-open password-only session does not silently elevate that session.

## Jurisdiction and membership

Workspace text may summarize NATIONAL, STATE or DISTRICT scope, but domain visibility remains SQL-scoped by the backend.

Institution membership contributes exact-institution resource scope only. It does not create a permission. A Compliance Workspace therefore cannot use membership to bypass missing `institution.*`, `enrollment.*`, `project.*` or `milestone.*` capabilities.

## Honest incomplete workspaces

The workspace shell can identify an Inspector, Inspection Supervisor or Auditor before all of their later domain modules exist. In that situation the UI is deliberately honest:

- Inspector / Supervisor workspaces do not fabricate assignments or inspection queues.
- Auditor workspaces do not fabricate an audit dashboard.
- National/State/District workspaces do not manufacture risk, anomaly or compliance scores.
- System Administration does not imply an authorization-management screen that has not been implemented.

The landing workspace links only to real functionality already backed by PostgreSQL and protected APIs.

## Responsive shell

Authenticated routes share a role-aware shell:

- desktop/tablet: persistent workspace sidebar plus contextual top bar;
- mobile: compact top bar plus bottom primary navigation;
- active-route indication;
- skip-to-content support;
- semantic focus behavior and reduced-motion support inherited from the design system.

`/login` remains outside the authenticated product shell.

## Local host-port overrides

Published Compose ports are configurable without changing Docker-internal service addresses. `.env.example` exposes:

```text
POSTGRES_HOST_PORT
REDIS_HOST_PORT
MINIO_API_HOST_PORT
MINIO_CONSOLE_HOST_PORT
BACKEND_HOST_PORT
WEB_HOST_PORT
```

The defaults remain `5432`, `6379`, `9000`, `9001`, `8080` and `3000` so CI and existing local environments remain backward-compatible. Only the host side changes when an operator overrides these values; internal addresses such as `postgres:5432`, `redis:6379`, `minio:9000` and `backend:8080` stay fixed.

## Verification

Phase 8 verification is split across three boundaries:

1. `apps/web/tests/workspace-model.test.mjs` locks the role mapping, deterministic precedence, capability-driven navigation and MFA-restriction contract.
2. `scripts/verify_workspaces.mjs` runs against the real backend and verifies the live `SYSTEM_ADMIN + NATIONAL` bootstrap context, pre-MFA permission withholding and backend denial of withheld capabilities.
3. `apps/web/tests/browser-smoke.mjs` establishes a real server session through the same-origin login endpoint, reloads through the normal refresh-cookie path, verifies the restricted System Administration workspace on desktop and mobile, checks navigation leakage/overflow, and captures regression renders.

Existing authentication, authorization, institution, program, database and PostGIS regression verification remains mandatory.
