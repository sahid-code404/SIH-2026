# Inspection Templates

NirikshanX inspection questionnaires are persisted data. Production questions are not hardcoded into backend or frontend source code.

## Domain boundary

An `inspection_template` is the stable business identity of a reusable questionnaire. Its editable content lives in numbered `inspection_template_versions`. A later inspection instance can therefore reference one exact published version without inheriting future edits.

Phase 9 intentionally stops at template authoring. It does not create inspection instances, assignments, sessions, captured evidence objects, risk scores or review outcomes.

## Relational graph

A template version owns this deterministic graph:

```text
inspection_templates
  └─ inspection_template_versions
       ├─ inspection_sections
       │    └─ inspection_questions
       │         └─ question_options
       ├─ question_conditions
       └─ evidence_requirements
```

Known structure is relational rather than stored in a JSON catch-all. Sections, questions and options have positive sequence numbers with parent-scoped uniqueness constraints.

Question codes are unique across a complete version, including across different sections. Conditions and evidence rules therefore reference stable question identities unambiguously inside one version.

## Supported question types

The engine supports exactly these types in this phase:

- `YES_NO`
- `TEXT`
- `LONG_TEXT`
- `NUMBER`
- `DATE`
- `SINGLE_SELECT`
- `MULTI_SELECT`
- `PHOTO`
- `VIDEO`
- `DOCUMENT`
- `LOCATION_CONFIRMATION`

Select options may be supplied only for `SINGLE_SELECT` and `MULTI_SELECT`. A select question must have at least one option before the graph is accepted.

## Version lifecycle

A template starts with draft version 1. The backend owns version state transitions; clients cannot submit arbitrary status values.

```text
create template → DRAFT v1
DRAFT → replace full validated graph → DRAFT
DRAFT → publish → PUBLISHED (immutable)
PUBLISHED → create new version → DRAFT vN+1
```

There can be at most one draft version for a template at a time. Version numbers are unique per template and increase monotonically.

Published versions are immutable at two independent layers:

1. service operations reject attempts to replace a published graph;
2. PostgreSQL triggers reject direct insert/update/delete of graph rows whose parent version is not `DRAFT`, and reject later mutation of an already-published version row.

This is deliberately stronger than mutating a published version until the first inspection uses it. It guarantees a published snapshot never drifts and keeps the later inspection-reference rule simple.

## Conditions

Conditions are data, not hardcoded questionnaire logic. Each condition contains:

- a unique condition code inside its version;
- one source question;
- a backend-validated operator;
- a typed comparison value when required;
- an optional target question;
- effects: show target, require target answer, suggest finding;
- deterministic sequence within the source question.

A condition can only reference questions from the same version and cannot target its own source question.

Operator compatibility is validated from the source question type. Examples include:

- `YES_NO` / `SINGLE_SELECT`: equality operators;
- text: equality and contains operators;
- number/date: equality and ordering operators;
- `MULTI_SELECT`: contains operators;
- all types: `IS_EMPTY` / `IS_NOT_EMPTY`.

Comparison values are also typed. `YES_NO` accepts only `YES` or `NO`; select conditions must reference an option value declared on the source question; numbers must parse as decimal values; dates use ISO `YYYY-MM-DD`.

The specification example “equipment unavailable → reason required → photo evidence required → finding suggested” is represented through generic condition/evidence rows. The question text itself is not embedded in source code.

## Evidence requirements

Evidence requirements can request:

- `PHOTO`
- `VIDEO`
- `DOCUMENT`
- `LOCATION_CONFIRMATION`

Each requirement belongs to one question and may optionally be activated by one condition in the same template version. `min_count` is bounded from 1 through 20. The actual evidence object, upload, hash, receipt and integrity workflows belong to later roadmap phases.

## Authorization

Template APIs use the existing PostgreSQL-backed authorization model:

- `inspection.read` — list templates and read allowed version graphs;
- `inspection.create` — create templates, replace drafts, publish and clone a new version.

No role-name checks are used in the template service. MFA withholding continues to work because effective permissions are resolved from current server authorization state.

A read-only caller sees published versions only. Draft versions are omitted from template detail and a guessed draft version identifier returns the same non-disclosing not-found behavior.

## API

```text
GET  /api/v1/inspection-templates
GET  /api/v1/inspection-templates/{templateId}
GET  /api/v1/inspection-templates/{templateId}/versions/{versionId}
POST /api/v1/inspection-templates
PUT  /api/v1/inspection-templates/{templateId}/versions/{versionId}/draft
POST /api/v1/inspection-templates/{templateId}/versions/{versionId}/publish
POST /api/v1/inspection-templates/{templateId}/versions/{versionId}/new-version
```

The catalog is server-side paginated and searchable. Draft replacement accepts an explicit allowlisted graph DTO and persists the validated graph atomically.

## Web workspace

`/inspection-templates` appears in the role-aware navigation only when the live effective authorization context includes `inspection.read`.

Authors can create a template and use the version builder for sections, typed questions, select options, conditions and evidence requirements. Read-only users receive the same real backend data without mutation controls. Restricted MFA sessions show an explicit restricted state rather than pretending that withheld authoring permissions work.

## Verification

`scripts/verify_inspection_templates.mjs` runs against the real Compose stack and PostgreSQL. It verifies V7, the seven-table graph, all eleven question types, invalid graph rejection, valid graph persistence, publication, API and SQL immutability, clone-to-new-version behavior, one-draft enforcement, read-only draft non-disclosure and permission denial.
