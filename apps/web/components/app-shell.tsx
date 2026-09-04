import type { ReactNode } from "react";

function Icon({ name }: { name: "system" | "components" | "tokens" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "system") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    );
  }

  if (name === "components") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const navigation = [
  { href: "#system", label: "System", icon: "system" as const },
  { href: "#components", label: "Components", icon: "components" as const },
  { href: "#tokens", label: "Tokens", icon: "tokens" as const },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="nx-app-layout">
      <a className="nx-skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className="nx-sidebar" aria-label="NirikshanX design-system navigation">
        <a className="nx-brand" href="#system" aria-label="NirikshanX design system home">
          <span className="nx-brand-mark" aria-hidden="true">
            NX
          </span>
          <span className="nx-brand-copy">
            <strong>NirikshanX</strong>
            <small>Trust & verification</small>
          </span>
        </a>

        <nav className="nx-primary-nav" aria-label="Primary">
          {navigation.map((item) => (
            <a href={item.href} key={item.href}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="nx-sidebar-note">
          <span>Phase 2</span>
          <strong>Design system</strong>
          <small>No product-role simulation in this phase.</small>
        </div>
      </aside>

      <div className="nx-content-wrap">
        <header className="nx-topbar">
          <div className="nx-topbar-title">
            <strong>Design system</strong>
            <span>Reusable UI foundation · SIH26095</span>
          </div>
          <span className="nx-phase-indicator">Foundation merged</span>
        </header>

        <main className="nx-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="nx-mobile-nav" aria-label="Mobile primary">
        {navigation.map((item) => (
          <a href={item.href} key={item.href}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
