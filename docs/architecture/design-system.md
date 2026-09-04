# NirikshanX Design System

## Status

This document describes the **implemented Phase 2 design-system work**. It does not claim that later authentication, inspection, evidence, CCTV, anomaly or risk engines exist.

The design system gives the unified NirikshanX PWA one coherent visual, responsive and accessibility contract before role-aware product workspaces are introduced.

## Visual direction

```text
clean government enterprise
+
subtle liquid polish
+
excellent hierarchy
+
minimal clutter
```

The design deliberately avoids generic dashboard styling, excessive cards, random gradients, glass on every surface and decorative operational metrics.

## SiteProof reference

`SiteProof/redesign/adaptive-glass-ui` remains read-only. NirikshanX adapts useful principles—semantic tokens, opaque readable surfaces, restrained ambient blur, consistent radii/depth, adaptive themes, deliberate status colors, compact shell proportions, visible focus, skip navigation and responsive layout—but does not copy SiteProof CSS or its role checks, routing model, localStorage token architecture or product authorization model.

## Token source of truth

`apps/web/app/globals.css`

### Surfaces

```text
--nx-background
--nx-surface
--nx-surface-muted
--nx-surface-elevated
--nx-border
--nx-border-strong
```

### Text

```text
--nx-text-primary
--nx-text-secondary
--nx-text-muted
```

### Primary interaction

```text
--nx-primary
--nx-primary-hover
--nx-primary-soft
--nx-on-primary
```

### Semantic states

```text
--nx-success / --nx-success-soft
--nx-warning / --nx-warning-soft
--nx-danger / --nx-danger-soft
--nx-info / --nx-info-soft
```

### Risk semantics

These are visual semantics only; they do not imply a risk engine exists.

```text
--nx-risk-low / --nx-risk-low-soft
--nx-risk-medium / --nx-risk-medium-soft
--nx-risk-high / --nx-risk-high-soft
--nx-risk-critical / --nx-risk-critical-soft
```

Shadow, radius, spacing and motion values are centralized as `--nx-*` tokens as well.

## Theme and motion

The current slice follows `prefers-color-scheme` for light/dark palettes. An explicit persisted user theme is intentionally not exposed yet.

`prefers-reduced-motion: reduce` disables smooth scrolling and collapses nonessential transition/animation duration.

## Responsive application shell

Implemented in `apps/web/components/app-shell.tsx`.

Desktop/tablet:

```text
sidebar + sticky top bar + main workspace
```

Mobile:

```text
compact sticky top bar + single-column workspace + fixed bottom navigation
```

The shell contains no role or authentication simulation. Current navigation points only to Phase 2 review sections.

## Implemented core primitives

`apps/web/components/ui/primitives.tsx`

- `Button` — primary, secondary, ghost, danger; small/medium/large sizing;
- `Card`;
- `Field`;
- `Input`;
- `Combobox` using native `input[list]` + `datalist` semantics;
- `Textarea`;
- `Select`;
- `Checkbox`;
- `Switch` using a checkbox plus `role="switch"`;
- `StatusBadge`;
- `SectionHeading`;
- `InlineNotice`.

## Implemented overlays

`apps/web/components/ui/overlays.tsx`

- `Dialog`;
- `Sheet`;
- `Drawer`;
- `Popover`.

Dialog, Sheet and Drawer are layout variants over the native HTML `<dialog>` modal behavior. They use explicit accessible titles/descriptions, native modal focus containment, Escape cancellation and visible close controls. The Popover uses native disclosure semantics through `<details>/<summary>`.

## Implemented responsive data/workflow patterns

`apps/web/components/ui/patterns.tsx`

- `Search`;
- `FilterBar`;
- `DataTable`;
- `MobileCardList`;
- `Pagination`;
- `Timeline`;
- `Stepper`.

The review page demonstrates one shared row source rendered as a desktop table and a narrow-screen card list, avoiding separate fake data models per viewport.

## Implemented semantic card patterns

`apps/web/components/ui/cards.tsx`

- `StatCard`;
- `RiskCard`;
- `AnomalyCard`.

`RiskCard` styling represents semantic risk levels only. It does not calculate risk. `AnomalyCard` displays a caller-provided review state but does not detect anomalies.

## Implemented domain UI boundaries

`apps/web/components/ui/domain-boundaries.tsx`

- `MapPanel` — provider-neutral map container; no map provider is implied;
- `EvidenceViewer` — evidence preview/metadata container; no evidence pipeline is implied;
- `CCTVStatusCard` — caller-provided status presentation; no CCTV connection is implied;
- `OfflineBanner` — connectivity-state presentation boundary;
- `SyncIndicator` — caller-provided synchronization-state presentation.

These components deliberately separate UI contracts from future domain engines. They are not populated with invented operational data on the Phase 2 review page.

## Accessibility baseline

Implemented:

- semantic HTML;
- native keyboard-operable controls;
- visible `:focus-visible` treatment;
- skip link to `#main-content`;
- associated form labels;
- checkbox and switch semantics;
- connected `aria-labelledby` section headings;
- `aria-live` only where asynchronous live status/synchronization state warrants it;
- errors use `role="alert"`;
- native modal dialog focus behavior and Escape cancellation;
- reduced-motion support;
- responsive data presentation without requiring horizontal scrolling on the mobile component variant.

Source-level contract tests in `apps/web/tests/design-system.test.mjs` guard key tokens, focus/reduced-motion rules, skip navigation, absence of SiteProof-style role checks/localStorage access, section label targets, native modal semantics and the real system-status endpoint.

These tests are intentionally zero-dependency and run with Node's built-in test runner. They complement—but do not replace—rendered browser review.

## CI render evidence

The full-stack CI job starts the actual Docker Compose stack and, after health/PostGIS checks, captures:

```text
desktop-1440x1200.png
mobile-390x844.png
```

from the running web application using the browser available on the GitHub-hosted runner. The images are uploaded as the `phase-02-ui-renders` workflow artifact for visual review.

## Product-data rule

The design system never invents data merely to look complete. In particular, examples must not imply that NirikshanX already has:

- AI findings;
- CCTV findings;
- attendance contradictions;
- inspection evidence;
- institution risk scores;
- anomaly decisions;
- verified receipts.

The only operational state on the review surface is the real foundation health contract.

## Remaining Phase 2 completion work

The component inventory is implemented, but Phase 2 stays open until verification is complete:

1. latest branch CI passes from a clean checkout;
2. full Docker Compose integration smoke passes;
3. desktop and mobile render artifacts are inspected for overflow, clipping, hierarchy and responsive collapse;
4. keyboard/focus behavior for overlays and controls receives browser-level review;
5. any visual/accessibility defects found during that review are fixed;
6. Issue #3 and its final documentation are updated from the verified result.
