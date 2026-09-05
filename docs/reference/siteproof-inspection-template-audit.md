# SiteProof Inspection Reference Audit

Reference repository: `sahid-code404/SiteProof`, branch `redesign/adaptive-glass-ui`.

This document records what was intentionally reused as an engineering pattern for NirikshanX Phase 9 and what was deliberately not copied.

## Useful SiteProof patterns

The SiteProof inspection implementation demonstrates several reliable boundaries:

- state changes are server-owned operations rather than arbitrary client status mutation;
- mutation methods validate preconditions before persisting state;
- business changes and audit records are written transactionally;
- history such as assignment replacement is retained instead of destructively overwritten;
- scoped resource lookup avoids exposing records outside the caller's authorized boundary;
- database uniqueness is used for important concurrency invariants;
- derived concepts are calculated instead of creating unnecessary persisted states.

Those principles remain useful for NirikshanX inspection-domain work.

## What was not reused

SiteProof's inspection model is intentionally much smaller. Its inspection record contains a fixed inspection type/status model and operational fields for one inspection lifecycle. It does not provide NirikshanX's specification-required generic template graph:

- `inspection_templates`
- `inspection_template_versions`
- `inspection_sections`
- `inspection_questions`
- `question_options`
- `question_conditions`
- `evidence_requirements`

It also does not implement the exact NirikshanX question-type catalog, version cloning, published snapshot immutability, generic conditional questionnaire authoring, or the richer RBAC/ABAC model already present in NirikshanX.

Therefore no SiteProof inspection table, enum or three-role authorization shortcut was copied into Phase 9.

## Adaptation used by NirikshanX

The reusable idea is the boundary, not the schema:

```text
client asks for domain operation
        ↓
backend validates permission + domain preconditions
        ↓
transaction applies relational mutation
        ↓
database constraints/triggers preserve invariants
        ↓
client reloads authoritative state
```

For template authoring, this becomes:

```text
create stable template
  → replace validated DRAFT graph
  → publish through dedicated backend operation
  → immutable PUBLISHED snapshot
  → clone published snapshot into next DRAFT version
```

The template graph itself is NirikshanX-specific and follows the SIH26095 master specification rather than SiteProof's simpler lifecycle data model.

## Forward boundary

SiteProof lifecycle ideas may remain useful when NirikshanX reaches the next roadmap phase for inspection instances and state transitions. They must still be adapted to NirikshanX's ten-role authorization, jurisdiction, institution/program relationships, exact template-version binding and surprise-inspection requirements instead of being copied wholesale.
