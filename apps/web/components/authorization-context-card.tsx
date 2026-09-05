"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, InlineNotice, StatusBadge } from "@/components/ui/primitives";

type Role = {
  assignmentId: string;
  code: string;
  displayName: string;
  mfaRequired: boolean;
  assignmentSource: string;
  assignedAt: string;
};

type Jurisdiction = {
  assignmentId: string;
  scopeType: "NATIONAL" | "STATE" | "DISTRICT";
  stateId: string | null;
  stateCode: string | null;
  stateName: string | null;
  districtId: string | null;
  districtCode: string | null;
  districtName: string | null;
  assignmentSource: string;
  assignedAt: string;
};

type AuthorizationContext = {
  roles: Role[];
  effectivePermissions: string[];
  withheldPermissions: string[];
  jurisdictions: Jurisdiction[];
  mfaRequired: boolean;
  mfaEnabled: boolean;
  sessionMfaVerified: boolean;
  mfaSatisfied: boolean;
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function scopeLabel(scope: Jurisdiction) {
  if (scope.scopeType === "NATIONAL") return "National";
  if (scope.scopeType === "STATE") return scope.stateName || scope.stateCode || "State";
  return [scope.districtName || scope.districtCode || "District", scope.stateName || scope.stateCode]
    .filter(Boolean)
    .join(" · ");
}

export function AuthorizationContextCard() {
  const { status, request } = useAuth();
  const [context, setContext] = useState<AuthorizationContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const response = await request("/api/v1/authz/me");
      if (!response.ok) throw new Error(await responseMessage(response));
      setContext((await response.json()) as AuthorizationContext);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load authorization context");
    }
  }, [request, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <Card className="nx-account-card nx-authz-card" as="section">
      <div className="nx-account-card-heading">
        <div>
          <h2>Authorization context</h2>
          <p>Roles, effective permissions and jurisdiction are resolved from current server state on every request.</p>
        </div>
        {context ? (
          <StatusBadge tone={context.mfaRequired && !context.mfaSatisfied ? "warning" : "success"}>
            {context.mfaRequired && !context.mfaSatisfied ? "Privilege gate active" : "Policy satisfied"}
          </StatusBadge>
        ) : null}
      </div>

      {error ? <InlineNotice tone="danger" title="Authorization unavailable">{error}</InlineNotice> : null}
      {!context && !error ? <p className="nx-authz-loading">Loading current authorization policy…</p> : null}

      {context ? (
        <>
          {context.mfaRequired && !context.mfaSatisfied ? (
            <InlineNotice tone="warning" title="MFA is required for privileged permissions">
              {context.mfaEnabled
                ? "This session has not completed MFA. Sign out and sign in again with your authenticator code to release privileged permissions."
                : "Set up an authenticator below, then sign out and sign in again with a fresh code. Privileged permissions remain withheld until then."}
            </InlineNotice>
          ) : null}

          <div className="nx-authz-section">
            <div className="nx-authz-section-heading">
              <strong>Roles</strong>
              <span>{context.roles.length}</span>
            </div>
            <div className="nx-authz-chips">
              {context.roles.map((role) => (
                <span className="nx-authz-chip" key={role.assignmentId} title={role.code}>
                  {role.displayName}{role.mfaRequired ? " · MFA" : ""}
                </span>
              ))}
              {context.roles.length === 0 ? <span className="nx-authz-empty">No active roles</span> : null}
            </div>
          </div>

          <div className="nx-authz-section">
            <div className="nx-authz-section-heading">
              <strong>Jurisdiction</strong>
              <span>{context.jurisdictions.length}</span>
            </div>
            <div className="nx-authz-chips">
              {context.jurisdictions.map((scope) => (
                <span className="nx-authz-chip" key={scope.assignmentId}>
                  {scope.scopeType} · {scopeLabel(scope)}
                </span>
              ))}
              {context.jurisdictions.length === 0 ? <span className="nx-authz-empty">No active jurisdiction</span> : null}
            </div>
          </div>

          <div className="nx-authz-section">
            <div className="nx-authz-section-heading">
              <strong>Effective permissions</strong>
              <span>{context.effectivePermissions.length}</span>
            </div>
            <div className="nx-authz-permissions" aria-label="Effective permissions">
              {context.effectivePermissions.map((permission) => <code key={permission}>{permission}</code>)}
              {context.effectivePermissions.length === 0 ? <span className="nx-authz-empty">No permissions are effective in this session.</span> : null}
            </div>
          </div>

          {context.withheldPermissions.length > 0 ? (
            <details className="nx-authz-withheld">
              <summary>{context.withheldPermissions.length} permissions withheld by current policy</summary>
              <div className="nx-authz-permissions">
                {context.withheldPermissions.map((permission) => <code key={permission}>{permission}</code>)}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
