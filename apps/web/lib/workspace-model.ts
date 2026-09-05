export type RoleView = {
  assignmentId: string;
  code: string;
  displayName: string;
  mfaRequired: boolean;
  assignmentSource: string;
  assignedAt: string;
};

export type JurisdictionView = {
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

export type AuthorizationContext = {
  roles: RoleView[];
  effectivePermissions: string[];
  withheldPermissions: string[];
  jurisdictions: JurisdictionView[];
  mfaRequired: boolean;
  mfaEnabled: boolean;
  sessionMfaVerified: boolean;
  mfaSatisfied: boolean;
};

export type WorkspaceKind =
  | "SYSTEM_ADMIN"
  | "NATIONAL"
  | "STATE"
  | "DISTRICT"
  | "SUPERVISOR"
  | "INSPECTOR"
  | "INSTITUTION"
  | "AUDIT"
  | "GENERAL";

export type WorkspaceDefinition = {
  kind: WorkspaceKind;
  title: string;
  shortTitle: string;
  description: string;
  primaryRoleCode: string | null;
  primaryRoleName: string | null;
};

export type NavigationItem = {
  href: string;
  label: string;
  icon: "workspace" | "institutions" | "programs" | "templates" | "account";
};

type WorkspaceTemplate = Omit<WorkspaceDefinition, "primaryRoleCode" | "primaryRoleName">;

const WORKSPACE_BY_ROLE: Record<string, WorkspaceTemplate> = {
  SYSTEM_ADMIN: {
    kind: "SYSTEM_ADMIN",
    title: "System Administration",
    shortTitle: "Administration",
    description: "Platform security, authorization context and implemented operational registries.",
  },
  MINISTRY_ADMIN: {
    kind: "NATIONAL",
    title: "National Command Center",
    shortTitle: "National",
    description: "National oversight of the institutions and programmes currently available in your authorized scope.",
  },
  MINISTRY_OFFICER: {
    kind: "NATIONAL",
    title: "National Command Center",
    shortTitle: "National",
    description: "National monitoring of implemented institution and programme records within your live authorization context.",
  },
  STATE_OFFICER: {
    kind: "STATE",
    title: "State Monitoring Workspace",
    shortTitle: "State",
    description: "State-scoped monitoring of implemented institutions, scheme enrollments and projects.",
  },
  DISTRICT_OFFICER: {
    kind: "DISTRICT",
    title: "District Operations",
    shortTitle: "District",
    description: "District-scoped operational access to the implemented institution and programme registries.",
  },
  INSPECTION_SUPERVISOR: {
    kind: "SUPERVISOR",
    title: "Inspection Operations",
    shortTitle: "Inspections",
    description: "Inspection supervision workspace. Assignment and lifecycle controls remain unavailable until their roadmap phases are implemented.",
  },
  INSPECTOR: {
    kind: "INSPECTOR",
    title: "Mobile Inspection Workspace",
    shortTitle: "Inspector",
    description: "Mobile-first field workspace. No inspection assignment is fabricated before the inspection lifecycle is implemented.",
  },
  INSTITUTION_ADMIN: {
    kind: "INSTITUTION",
    title: "Compliance Workspace",
    shortTitle: "Compliance",
    description: "Institution-scoped compliance access based on live membership and effective permissions.",
  },
  INSTITUTION_OPERATOR: {
    kind: "INSTITUTION",
    title: "Compliance Workspace",
    shortTitle: "Compliance",
    description: "Institution-scoped operational access based on live membership and effective permissions.",
  },
  AUDITOR: {
    kind: "AUDIT",
    title: "Audit & Review Workspace",
    shortTitle: "Audit",
    description: "Read-oriented oversight of the implemented records visible inside your current jurisdiction.",
  },
};

// Presentation-only precedence. This does not grant permissions or resource scope.
// It chooses one landing-workspace identity for users who legitimately hold multiple roles.
export const WORKSPACE_ROLE_PRECEDENCE = [
  "SYSTEM_ADMIN",
  "MINISTRY_ADMIN",
  "MINISTRY_OFFICER",
  "STATE_OFFICER",
  "DISTRICT_OFFICER",
  "INSPECTION_SUPERVISOR",
  "AUDITOR",
  "INSTITUTION_ADMIN",
  "INSTITUTION_OPERATOR",
  "INSPECTOR",
] as const;

export function resolveWorkspace(context: AuthorizationContext): WorkspaceDefinition {
  const roles = new Map(context.roles.map((role) => [role.code, role]));
  for (const roleCode of WORKSPACE_ROLE_PRECEDENCE) {
    const role = roles.get(roleCode);
    const template = WORKSPACE_BY_ROLE[roleCode];
    if (role && template) {
      return {
        ...template,
        primaryRoleCode: role.code,
        primaryRoleName: role.displayName,
      };
    }
  }

  return {
    kind: "GENERAL",
    title: "NirikshanX Workspace",
    shortTitle: "Workspace",
    description: "Your workspace is derived from the roles, permissions and resource scope currently returned by the server.",
    primaryRoleCode: context.roles[0]?.code ?? null,
    primaryRoleName: context.roles[0]?.displayName ?? null,
  };
}

export function buildNavigation(context: AuthorizationContext): NavigationItem[] {
  const permissions = new Set(context.effectivePermissions);
  const items: NavigationItem[] = [{ href: "/", label: "Workspace", icon: "workspace" }];

  if (permissions.has("institution.read")) {
    items.push({ href: "/institutions", label: "Institutions", icon: "institutions" });
  }

  if (
    permissions.has("scheme.read") ||
    permissions.has("enrollment.read") ||
    permissions.has("project.read") ||
    permissions.has("milestone.read")
  ) {
    items.push({ href: "/programs", label: "Programs", icon: "programs" });
  }

  if (permissions.has("inspection.read")) {
    items.push({ href: "/inspection-templates", label: "Templates", icon: "templates" });
  }

  items.push({ href: "/account", label: "Account", icon: "account" });
  return items;
}

export function isPrivilegeRestricted(context: AuthorizationContext) {
  return context.mfaRequired && !context.mfaSatisfied && context.withheldPermissions.length > 0;
}

export function jurisdictionSummary(context: AuthorizationContext) {
  const scopes = context.jurisdictions;
  if (scopes.some((scope) => scope.scopeType === "NATIONAL")) return "National scope";

  const stateNames = Array.from(
    new Set(
      scopes
        .filter((scope) => scope.scopeType === "STATE")
        .map((scope) => scope.stateName || scope.stateCode)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (stateNames.length === 1) return stateNames[0];
  if (stateNames.length > 1) return `${stateNames.length} state scopes`;

  const districtNames = Array.from(
    new Set(
      scopes
        .filter((scope) => scope.scopeType === "DISTRICT")
        .map((scope) => scope.districtName || scope.districtCode)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (districtNames.length === 1) return districtNames[0];
  if (districtNames.length > 1) return `${districtNames.length} district scopes`;

  return "No government jurisdiction";
}