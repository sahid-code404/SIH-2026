# NIRIKSHANX

**SIH26095 — Trust, Monitoring, Surprise Inspection, Evidence Verification & Compliance Intelligence Platform**

NirikshanX is a scheme-agnostic monitoring and verification platform for the Department of Social Justice and Empowerment. Its central question is:

> How strongly can the Ministry trust the operational claims, inspection evidence, and compliance state reported by an institution?

## Engineering principles

- Build a **modular monolith** first; split services only where runtime characteristics justify it.
- PostgreSQL + PostGIS is the authoritative business-data store.
- Use one responsive PWA with role-aware workspaces.
- Treat AI as decision support: **AI recommends; humans decide**.
- Use tamper-evident evidence, independent server verification, immutable audit history, and explainable scores.
- Never treat GPS, a photo, CCTV, attendance data, or an AI score as absolute truth by itself.
- Build vertical slices: schema → backend rules → API → authorization → frontend → tests → verification → documentation.
- Do not scaffold fake features or hard-code demo intelligence.

## SiteProof relationship

`github.com/sahid-code404/SiteProof` branch `redesign/adaptive-glass-ui` is a **read-only technical reference** for selected high-assurance evidence concepts. NirikshanX is not a rename or fork of SiteProof.

High-value donor concepts include challenge lifecycle discipline, evidence hashing/packaging, immutable assignment history, audit events, sensor/camera verification ideas, signed receipts, and selected UX patterns. Authentication/storage/authorization decisions that do not fit NirikshanX are explicitly not inherited.

## Target architecture

```text
Unified Next.js PWA
        │
        ▼
Secure Spring Boot API
        │
        ▼
Modular Monolith
  ├─ Identity & Access
  ├─ Institutions / Schemes
  ├─ Inspections / Assignments
  ├─ Evidence / Challenges
  ├─ Risk / Anomalies / Fusion
  ├─ Corrective Actions
  └─ Audit / Notifications
        │
        ├─ PostgreSQL + PostGIS
        ├─ Redis
        └─ S3-compatible private object storage (MinIO locally)

Separate only where justified:
  ├─ AI workers
  └─ CCTV edge/analytics
```

## Planned stack

- **Web:** Next.js, React, strict TypeScript, App Router, Tailwind CSS, shadcn/ui/Radix, TanStack Query, React Hook Form, Zod, Motion, MapLibre GL JS, IndexedDB, Service Worker/PWA.
- **Backend:** Java LTS, Spring Boot, Spring Security, Spring Data JPA/Hibernate, Flyway, Gradle Kotlin DSL, Actuator, Micrometer, OpenTelemetry.
- **Data:** PostgreSQL + PostGIS, Redis, MinIO/S3 abstraction.
- **AI/CV where justified:** Python, FastAPI internal inference, OpenCV, NumPy, scikit-learn, ONNX Runtime.

Exact dependency versions are pinned only after compatibility and current stable-release checks.

## Execution order

1. Repository audit
2. SiteProof reference audit
3. Foundation
4. Design system
5. Database core
6. Authentication
7. Authorization
8. Institutions
9. Schemes / projects
10. Role-aware workspaces
11. Inspection templates and lifecycle
12. Inspector profiles and surprise assignment
13. Inspector PWA + offline storage/sync
14. Proof-of-presence + live challenge engine
15. Evidence upload, hashing, chain, receipts, similarity
16. Anomaly and explainable risk engines
17. CCTV / attendance intelligence
18. Corrective actions, reporting, hardening, SIH demo

## Current status

**Phase 0 started.** The repository was empty at initialization. No feature is considered implemented until it is backed by real persisted data, authorization, tests, and verification.

See `docs/reference/siteproof-reuse-map.md` and `docs/architecture/technology-baseline.md` as they are added during the initial audit.
