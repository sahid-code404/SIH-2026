# Schemes, Enrollments, Projects and Milestones

Phase 7 introduces the first scheme-aware domain layer in NirikshanX while keeping the platform scheme-agnostic. The master specification requires four canonical resources: `schemes`, `institution_scheme_enrollments`, `projects`, and `project_milestones`, and explicitly requires that the platform **not hardcode one scheme**.

## Domain model

### Scheme

`schemes` stores a canonical scheme definition with a stable UUID, normalized business code, human-readable name, optional short name and description, normalized status code, optional effective dates, and server-maintained audit timestamps.

The shared schema deliberately does not contain scheme-specific policy columns. Status remains a constrained normalized code rather than a guessed closed government taxonomy. Authoritative scheme catalogs can be populated later from an approved source without changing the cross-scheme relationship model.

### Institution scheme enrollment

`institution_scheme_enrollments` links one canonical institution to one canonical scheme. An enrollment owns its enrollment code, normalized status, enrollment date, optional end date, and timestamps.

A partial unique index rejects more than one active enrollment for the same institution/scheme pair. Ending an enrollment preserves history rather than deleting the relationship.

### Project

`projects` references exactly one enrollment through `enrollment_id`. Institution and scheme IDs are therefore not duplicated as unchecked project columns. The project inherits its canonical institution and scheme through:

`project -> institution_scheme_enrollment -> institution + scheme`

This prevents a project from claiming an institution/scheme combination that does not match its enrollment. Project-owned fields include its code, title, optional description, normalized status, planned dates, actual dates, and timestamps.

### Project milestone

`project_milestones` belongs to exactly one project. A positive `sequence_no` gives deterministic ordering, and PostgreSQL rejects duplicate sequence numbers within a project. Optional code, description, due date and completion time remain milestone-owned fields.

## Authorization

Phase 7 adds granular database-backed capabilities:

- `scheme.read`, `scheme.create`, `scheme.update`
- `enrollment.read`, `enrollment.create`, `enrollment.update`
- `project.read`, `project.create`, `project.update`
- `milestone.read`, `milestone.create`, `milestone.update`

A user must have the relevant capability before a program operation is permitted. Membership never supplies a missing capability.

Scheme definitions are global catalog resources and are permission-scoped. Enrollment, project and milestone resources additionally inherit live resource scope from their parent institution. That scope is granted by either a matching NATIONAL/STATE/DISTRICT jurisdiction or an active membership to the exact institution.

Nested detail operations intentionally return the same not-found behavior when the parent institution is outside the caller's scope, reducing resource-existence disclosure through guessed IDs. Server-side list/search/count queries apply the scope predicate in SQL before pagination and totals are calculated.

## APIs

The Phase 7 REST surface includes:

- `GET /api/v1/schemes`
- `POST /api/v1/schemes`
- `GET /api/v1/schemes/{schemeId}`
- `PUT /api/v1/schemes/{schemeId}`
- `GET /api/v1/enrollments`
- `POST /api/v1/enrollments`
- `GET /api/v1/enrollments/{enrollmentId}`
- `PUT /api/v1/enrollments/{enrollmentId}`
- `GET /api/v1/institutions/{institutionId}/scheme-enrollments`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{projectId}`
- `PUT /api/v1/projects/{projectId}`
- `GET /api/v1/projects/{projectId}/milestones`
- `POST /api/v1/projects/{projectId}/milestones`
- `PUT /api/v1/projects/{projectId}/milestones/{milestoneId}`

Search, filtering, sorting and pagination are bounded server-side. DTOs use explicit allowlists; request bodies cannot mass-assign parent scope or audit fields.

## Web surfaces

`/programs` is the protected scheme/enrollment/project registry. It uses the current effective permission set to expose only implemented actions. Scheme and project search calls the backend rather than fetching all rows into the browser. Desktop uses data tables and mobile uses responsive cards.

`/projects/{projectId}` shows the persisted project overview, schedule and real milestones only. It does not add inspection, risk, CCTV, attendance or other future modules before their roadmap phases.

Institution detail pages expose a real Schemes & Projects panel when the caller has the corresponding read capabilities. The panel is backed by the scoped Phase 7 APIs and does not fabricate Institution 360 content.

## Verification

`scripts/verify_programs.mjs` exercises the Phase 7 domain against the real Compose PostgreSQL/PostGIS/backend stack. It verifies migration presence, relationship and uniqueness constraints, scoped lists/details/search counts, exact membership scope, RBAC non-bypass, immediate membership revocation, and duplicate enrollment/milestone rejection.

`scripts/verify_authorization_current.mjs` is the additive authorization regression used after permission-catalog expansion. It requires all original Phase 5 permissions to remain present while allowing later phases to add new capabilities.

All verifier fixtures use dedicated CI UUIDs and are removed child-first before the next regression step.

## Deliberate non-scope

Phase 7 does not implement role-aware workspace routing, scheme-specific dynamic forms, inspection templates or lifecycle, external-system references, financial-disbursement policy, risk/anomaly/CCTV/attendance/corrective-action modules, or fake production scheme/project seed data.
