"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, InlineNotice, StatusBadge } from "@/components/ui/primitives";

type PageTotal = { total: number };

type Summary = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export default function WorkspaceHome() {
  const { user, request } = useAuth();
  const { authorization, workspace, jurisdictionLabel, privilegeRestricted } = useWorkspace();
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permissions = useMemo(() => new Set(authorization?.effectivePermissions ?? []), [authorization]);

  const loadTotals = useCallback(async () => {
    if (!authorization) return;
    const targets: Array<[string, string]> = [];
    if (permissions.has("institution.read")) targets.push(["institutions", "/api/v1/institutions?page=0&size=1"]);
    if (permissions.has("scheme.read")) targets.push(["schemes", "/api/v1/schemes?page=0&size=1&sort=name&direction=asc"]);
    if (permissions.has("project.read")) targets.push(["projects", "/api/v1/projects?page=0&size=1&sort=title&direction=asc"]);

    if (targets.length === 0) {
      setTotals({});
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const entries = await Promise.all(
        targets.map(async ([key, path]) => {
          const response = await request(path, { cache: "no-store" });
          if (!response.ok) throw new Error(await responseMessage(response));
          const body = (await response.json()) as PageTotal;
          return [key, body.total] as const;
        }),
      );
      setTotals(Object.fromEntries(entries));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load workspace summaries");
    } finally {
      setLoading(false);
    }
  }, [authorization, permissions, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTotals(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTotals]);

  if (!authorization || !workspace || !user) return null;

  const operationalSummaries: Summary[] = [];
  if (permissions.has("institution.read")) {
    operationalSummaries.push({
      key: "institutions",
      label: "Authorized institutions",
      value: loading && totals.institutions === undefined ? "…" : String(totals.institutions ?? 0),
      detail: "Server-scoped records visible to your live jurisdiction or membership.",
    });
  }
  if (permissions.has("scheme.read")) {
    operationalSummaries.push({
      key: "schemes",
      label: "Scheme catalog",
      value: loading && totals.schemes === undefined ? "…" : String(totals.schemes ?? 0),
      detail: "Persisted scheme-agnostic catalogue records.",
    });
  }
  if (permissions.has("project.read")) {
    operationalSummaries.push({
      key: "projects",
      label: "Authorized projects",
      value: loading && totals.projects === undefined ? "…" : String(totals.projects ?? 0),
      detail: "Projects inherited from institutions currently visible to you.",
    });
  }

  const summaries = operationalSummaries.length > 0
    ? operationalSummaries.slice(0, 3)
    : [
        {
          key: "permissions",
          label: "Effective permissions",
          value: String(authorization.effectivePermissions.length),
          detail: "Capabilities currently released by server-side authorization policy.",
        },
        {
          key: "roles",
          label: "Active roles",
          value: String(authorization.roles.length),
          detail: "Current role assignments used to choose this presentation workspace.",
        },
        {
          key: "jurisdictions",
          label: "Jurisdiction assignments",
          value: String(authorization.jurisdictions.length),
          detail: "Government geography scopes currently active for this account.",
        },
      ];

  const canOpenPrograms =
    permissions.has("scheme.read") ||
    permissions.has("enrollment.read") ||
    permissions.has("project.read") ||
    permissions.has("milestone.read");

  const inspectionWorkspace = workspace.kind === "INSPECTOR" || workspace.kind === "SUPERVISOR";
  const auditWorkspace = workspace.kind === "AUDIT";

  return (
    <main className="nx-workspace-home" id="main-content" tabIndex={-1}>
      <section className="nx-workspace-home-hero">
        <div>
          <span className="nx-page-meta">{workspace.primaryRoleName || "Authorized workspace"}</span>
          <h1>{workspace.title}</h1>
          <p>{workspace.description}</p>
        </div>
        <div className="nx-workspace-context" aria-label="Current workspace context">
          <span>Current scope</span>
          <strong>{jurisdictionLabel}</strong>
          <small>{authorization.roles.length} role{authorization.roles.length === 1 ? "" : "s"} · {authorization.effectivePermissions.length} effective permissions</small>
          <StatusBadge tone={authorization.mfaRequired && !authorization.mfaSatisfied ? "warning" : "success"}>
            {authorization.mfaRequired && !authorization.mfaSatisfied ? "MFA gate active" : "Session policy satisfied"}
          </StatusBadge>
        </div>
      </section>

      {privilegeRestricted ? (
        <div className="nx-workspace-restricted">
          <InlineNotice tone="warning" title="Privileged capabilities are currently withheld">
            This account has an MFA-protected role, but this session has not satisfied that policy. Set up an authenticator if needed, then sign out and complete a fresh MFA sign-in. The workspace never treats withheld permissions as usable.
          </InlineNotice>
        </div>
      ) : null}

      {error ? (
        <div className="nx-workspace-restricted">
          <InlineNotice tone="danger" title="Workspace summary unavailable">{error}</InlineNotice>
        </div>
      ) : null}

      <section className="nx-workspace-summary-grid" aria-label="Live workspace summary" aria-busy={loading}>
        {summaries.map((summary) => (
          <Card className="nx-workspace-summary-card" as="article" key={summary.key}>
            <span>{summary.label}</span>
            <strong>{summary.value}</strong>
            <small>{summary.detail}</small>
          </Card>
        ))}
      </section>

      <section className="nx-workspace-sections">
        <Card className="nx-workspace-panel" as="section">
          <h2>Available work</h2>
          <p>Links appear only for implemented routes backed by permissions effective in this session. Backend APIs remain the security boundary.</p>
          <div className="nx-workspace-action-list">
            {permissions.has("institution.read") ? (
              <Link href="/institutions">
                <div><strong>Institution registry</strong><small>Search and open institutions inside your authorized scope.</small></div>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            {canOpenPrograms ? (
              <Link href="/programs">
                <div><strong>Programs & projects</strong><small>Work with readable schemes, enrollments, projects and milestones.</small></div>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            <Link href="/account">
              <div><strong>Account & security</strong><small>Review sessions, MFA and your current authorization context.</small></div>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Card>

        <Card className="nx-workspace-panel" as="section">
          <h2>Workspace boundary</h2>
          <p>
            {inspectionWorkspace
              ? "Inspection templates, assignments and field execution are intentionally absent until their dedicated roadmap phases are implemented."
              : auditWorkspace
                ? "The dedicated Audit UI is not implemented yet. Current access is limited to already implemented readable resources."
                : "Only currently implemented institution, scheme, enrollment and project capabilities are shown. Future monitoring modules stay absent until they are real."}
          </p>
          <div className="nx-workspace-future-note">
            Workspace selection changes navigation and presentation only. It does not create permissions, widen jurisdiction, manufacture institution membership or bypass MFA.
          </div>
        </Card>
      </section>
    </main>
  );
}
