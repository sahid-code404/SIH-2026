# V7 Inspection Template Schema

Flyway migration `V7__inspection_templates.sql` adds the authoritative inspection-questionnaire model.

## Tables

| Table | Purpose |
| --- | --- |
| `inspection_templates` | Stable reusable template identity and business code. |
| `inspection_template_versions` | Numbered draft/published snapshots. |
| `inspection_sections` | Ordered sections inside one version. |
| `inspection_questions` | Ordered, typed questions with version-wide unique codes. |
| `question_options` | Ordered values for select questions. |
| `question_conditions` | Conditional triggers/effects referencing questions in the same version. |
| `evidence_requirements` | Typed evidence requirements, optionally activated by a condition. |

Every primary key is UUID. Business timestamps are UTC `TIMESTAMPTZ` and use the existing audit timestamp trigger discipline.

## Identity and ordering constraints

- template code is globally unique;
- `(template_id, version_no)` is unique;
- a partial unique index permits at most one `DRAFT` version per template;
- section code and sequence are unique per version;
- question code is unique per version, even across sections;
- question sequence is unique per section;
- option value and sequence are unique per question;
- condition code is unique per version and sequence is unique per source question;
- evidence sequence is unique per question.

All sequence values must be positive.

## Cross-version integrity

Composite unique keys such as `(id, version_id)` support composite foreign keys so child rows cannot silently point across template versions.

Examples:

- `inspection_questions(section_id, version_id)` references `inspection_sections(id, version_id)`;
- `question_options(question_id, version_id)` references `inspection_questions(id, version_id)`;
- condition source and target question references include `version_id`;
- evidence question and optional condition references include `version_id`.

This makes same-version ownership a database invariant rather than only a service convention.

## Question type constraint

`inspection_questions.question_type` is constrained to exactly:

```text
YES_NO
TEXT
LONG_TEXT
NUMBER
DATE
SINGLE_SELECT
MULTI_SELECT
PHOTO
VIDEO
DOCUMENT
LOCATION_CONFIRMATION
```

Higher-order compatibility, such as whether a question may have options and whether a condition operator/comparison value is valid for its source question type, is validated by the backend before writes.

## Condition constraints

Database constraints enforce the supported operator catalog, comparison-null behavior for empty/not-empty checks, non-self target references, and target presence when show/require-target effects are selected.

The backend adds semantic validation for source type/operator compatibility, typed comparison values, same-version codes and rule effects.

## Evidence constraints

`evidence_type` is restricted to:

```text
PHOTO
VIDEO
DOCUMENT
LOCATION_CONFIRMATION
```

`min_count` must be between 1 and 20.

The schema stores requirement metadata only. Evidence files, hashes, upload receipts and verification results are deliberately absent from V7.

## Published immutability

Two trigger functions protect version snapshots.

`nirikshanx_guard_published_template_version()` prevents any later update to an already-published `inspection_template_versions` row and validates the publish transition metadata.

`nirikshanx_require_draft_template_version()` runs before insert/update/delete on all graph tables. A graph mutation succeeds only when its parent version currently has `status='DRAFT'`.

Therefore direct SQL cannot alter published questionnaire content even if application-level draft checks are bypassed.

## Indexes

Indexes are aligned to current access paths rather than speculative analytics:

- case-insensitive template-name search;
- template/version status and descending version number;
- deterministic section/question/option ordering;
- condition source/target traversal;
- evidence question/condition traversal.

Future inspection execution tables will reference an exact published version instead of copying or resolving “latest” template content at runtime.
