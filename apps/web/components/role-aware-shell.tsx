"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useWorkspace } from "@/components/workspace-provider";
import type { NavigationItem } from "@/lib/workspace-model";

function NavIcon({ name }: { name: NavigationItem["icon"] }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "workspace") {
    return (
      <svg {...common}>
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M9.5 20v-5.5h5V20" />
      </svg>
    );
  }

  if (name === "institutions") {
    return (
      <svg {...common}>
        <path d="M4 20h16" />
        <path d="M6 20V8h12v12" />
        <path d="M9 8V5h6v3" />
        <path d="M9 12h2M13 12h2M9 16h2M13 16h2" />
      </svg>
    );
  }

  if (name === "programs") {
    return (
      <svg {...common}>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/programs") return pathname === "/programs" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RoleAwareShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status: authStatus, user } = useAuth();
  const {
    status: workspaceStatus,
    workspace,
    navigation,
    jurisdictionLabel,
    privilegeRestricted,
    authorization,
    error,
  } = useWorkspace();

  const publicRoute = pathname === "/login";

  useEffect(() => {
    if (!publicRoute && authStatus === "anonymous") router.replace("/login");
  }, [authStatus, publicRoute, router]);

  if (publicRoute) return <>{children}</>;

  if (authStatus === "loading" || (authStatus === "authenticated" && (workspaceStatus === "idle" || workspaceStatus === "loading"))) {
    return (
      <main className="nx-workspace-boot" id="main-content">
        <span className="nx-brand-mark" aria-hidden="true">NX</span>
        <strong>Restoring secure workspace…</strong>
      </main>
    );
  }

  if (authStatus !== "authenticated" || !user) {
    return (
      <main className="nx-workspace-boot" id="main-content">
        <span className="nx-brand-mark" aria-hidden="true">NX</span>
        <strong>Redirecting to secure sign in…</strong>
      </main>
    );
  }

  if (workspaceStatus === "error" || !workspace || !authorization) {
    return (
      <main className="nx-workspace-boot" id="main-content">
        <span className="nx-brand-mark" aria-hidden="true">NX</span>
        <strong>Workspace context is unavailable</strong>
        <p>{error || "The server did not return an authorization context for this session."}</p>
        <Link href="/account">Open account & security</Link>
      </main>
    );
  }

  return (
    <div className="nx-workspace-layout">
      <a className="nx-skip-link" href="#main-content">Skip to content</a>

      <aside className="nx-workspace-sidebar" aria-label="NirikshanX workspace navigation">
        <Link className="nx-workspace-brand" href="/" aria-label="NirikshanX workspace home">
          <span className="nx-brand-mark" aria-hidden="true">NX</span>
          <span>
            <strong>NirikshanX</strong>
            <small>Trust & verification</small>
          </span>
        </Link>

        <div className="nx-workspace-identity">
          <span>{workspace.shortTitle}</span>
          <strong>{user.displayName}</strong>
          <small>{workspace.primaryRoleName || "Authenticated user"}</small>
        </div>

        <nav className="nx-workspace-nav" aria-label="Primary">
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={isActive(pathname, item.href) ? "is-active" : undefined}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={`nx-workspace-policy ${privilegeRestricted ? "is-restricted" : ""}`}>
          <span>{privilegeRestricted ? "Restricted session" : "Current scope"}</span>
          <strong>{privilegeRestricted ? "MFA required" : jurisdictionLabel}</strong>
          <small>
            {privilegeRestricted
              ? `${authorization.withheldPermissions.length} privileged permissions are withheld until a fresh MFA sign-in.`
              : `${authorization.effectivePermissions.length} effective permissions resolved from current server state.`}
          </small>
          {privilegeRestricted ? <Link href="/account">Review security</Link> : null}
        </div>
      </aside>

      <div className="nx-workspace-main">
        <header className="nx-workspace-topbar">
          <div>
            <strong>{workspace.title}</strong>
            <span>{jurisdictionLabel}</span>
          </div>
          <Link className="nx-workspace-account-link" href="/account">
            <span aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{user.displayName}</span>
          </Link>
        </header>

        <div className="nx-workspace-content">{children}</div>
      </div>

      <nav className="nx-workspace-mobile-nav" aria-label="Mobile primary">
        {navigation.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className={isActive(pathname, item.href) ? "is-active" : undefined}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
