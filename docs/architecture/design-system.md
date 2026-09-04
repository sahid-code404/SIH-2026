# NirikshanX Design System

## Status

This document describes the **implemented Phase 2 slice only**. It is not a promise that every future product component already exists.

The design system exists to give the unified NirikshanX PWA one coherent visual, responsive and accessibility contract before role-aware product workspaces are introduced.

## Visual direction

Target:

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

`SiteProof/redesign/adaptive-glass-ui` is a read-only design reference. NirikshanX currently adapts these useful principles:

- semantic visual tokens;
- opaque readable surfaces as the default;
- restrained ambient blur instead of full-screen glass;
- consistent radii and depth;
- adaptive light/dark behavior;
- deliberate status colors;
- compact desktop shell proportions;
- visible focus and a skip-link pattern;
- responsive navigation patterns.

NirikshanX does **not** copy SiteProof's CSS file-by-file and does not import its role checks, routing model, access-token storage or product architecture.

## Implemented token groups

Source of truth: `apps/web/app/globals.css`.

### Surfaces

```text
--nx-background
--nx-surface
--nx-surface-muted
--nx-surface-elevated
--nx-border
--nx-border-strong
```

### Typography colors

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
--nx-success
--nx-success-soft
--nx-warning
--nx-warning-soft
--nx-danger
--nx-danger-soft
--nx-info
--nx-info-soft
```

### Risk semantics

These are visual semantic tokens only. Their presence does **not** mean a risk engine exists yet.

```text
--nx-risk-low
--nx-risk-low-soft
--nx-risk-medium
--nx-risk-medium-soft
--nx-risk-high
--nx-risk-high-soft
--nx-risk-critical
--nx-risk-critical-soft
```

### Geometry and motion

The implemented system centralizes shadow, radius, spacing and motion values. Components should prefer these tokens rather than introduce arbitrary one-off values when a shared semantic value exists.

## Theme behavior

The current slice follows the operating-system preference using `prefers-color-scheme`. Both light and dark palettes preserve semantic state meaning.

A future explicit user theme preference may override this system preference, but no fake setting is exposed before persistence behavior is implemented.

## Motion

Motion is limited to short interaction feedback such as button movement, navigation hover, switch movement and sticky-surface transitions.

`prefers-reduced-motion: reduce` collapses nonessential transition/animation duration and disables smooth scrolling.

## Accessibility baseline

Implemented now:

- semantic HTML for the live-status and component-review surface;
- keyboard-operable native form controls;
- globally visible `:focus-visible` treatment;
- skip link to `#main-content`;
- properly associated form labels;
- native checkbox semantics;
- switch semantics implemented with a checkbox plus `role="switch"`;
- section labels connected with `aria-labelledby`;
- `aria-live` only around the asynchronously loaded live system status;
- error notices use `role="alert"`;
- non-error static notices are not unnecessarily announced as live regions;
- reduced-motion support.

Accessible dialog/sheet/drawer focus management is **not yet claimed as implemented**.

## Responsive application shell

Implemented in `apps/web/components/app-shell.tsx`.

### Desktop / tablet

```text
sidebar
+
sticky top bar
+
main workspace
```

The shell does not contain authorization or role simulation. Its navigation currently points only to Phase 2 review sections.

### Mobile

Below the mobile breakpoint the sidebar is removed and a compact fixed bottom navigation is used. Main content remains single-column where required, and the page reserves bottom space for the navigation and safe-area inset.

## Implemented UI primitives

Source: `apps/web/components/ui/primitives.tsx`.

Implemented:

- `Button`
  - primary
  - secondary
  - ghost
  - danger
  - small / medium / large sizing
- `Card`
- `Field`
- `Input`
- `Textarea`
- `Select`
- `Checkbox`
- `Switch`
- `StatusBadge`
- `SectionHeading`
- `InlineNotice`

The design-system review surface uses neutral component examples. Its only operational information is the real foundation health response from `/api/v1/system/status` through the same-origin web route.

## Not yet implemented in this phase

The following items are part of Issue #3 scope but are not claimed complete by this document yet:

- Combobox;
- Dialog;
- Sheet;
- Drawer;
- Popover;
- StatCard;
- RiskCard;
- AnomalyCard;
- DataTable;
- MobileCardList;
- Search;
- FilterBar;
- Pagination;
- Timeline;
- Stepper;
- MapPanel;
- EvidenceViewer;
- CCTVStatusCard;
- OfflineBanner;
- SyncIndicator;
- component-level automated accessibility interaction tests;
- browser-based desktop/mobile visual sign-off.

These will be implemented and verified before Phase 2 is declared complete, rather than being created as inert future-feature stubs.

## Product-data rule

The design system must never invent data merely to look complete. In particular, design-system examples must not imply that NirikshanX already has:

- AI findings;
- CCTV findings;
- attendance contradictions;
- inspection evidence;
- institution risk scores;
- anomaly decisions;
- completed verification receipts.

Risk colors may be demonstrated only as explicitly labeled semantic token samples until the real risk module exists.

## Phase 2 completion gate

Phase 2 remains open until all Issue #3 acceptance criteria are met, including:

1. reusable components and tokens are implemented rather than documented only;
2. CI remains green from a clean checkout;
3. the full stack still starts through Docker Compose;
4. desktop and mobile rendering are visually reviewed;
5. keyboard/focus/responsive behavior is exercised;
6. documentation matches the code actually present.
