"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  InlineNotice,
  Input,
  SectionHeading,
  Select,
  StatusBadge,
  Switch,
  Textarea,
} from "@/components/ui/primitives";

type ComponentState = {
  status: "UP" | "DOWN";
};

type SystemStatus = {
  service: string;
  status: "UP" | "DEGRADED";
  components: {
    database: ComponentState;
    redis: ComponentState;
  };
};

function statusTone(value: string) {
  if (value === "UP") return "success" as const;
  if (value === "CHECKING") return "neutral" as const;
  if (value === "DEGRADED") return "warning" as const;
  return "danger" as const;
}

export default function Home() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/backend-api/api/v1/system/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return (await response.json()) as SystemStatus;
      })
      .then((nextStatus) => {
        setStatus(nextStatus);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Backend unavailable");
      });

    return () => controller.abort();
  }, []);

  const backend = status?.status ?? (error ? "DOWN" : "CHECKING");
  const database = status?.components.database.status ?? (error ? "DOWN" : "CHECKING");
  const redis = status?.components.redis.status ?? (error ? "DOWN" : "CHECKING");

  return (
    <AppShell>
      <header className="nx-page-heading">
        <span className="nx-page-meta">SIH26095 · Phase 2</span>
        <h1>A calm, authoritative interface system for trusted verification work.</h1>
        <p>
          This phase establishes reusable visual, responsive and accessibility primitives. Operational cards below use only the
          live foundation health contract; the remaining controls are explicitly design-system examples rather than simulated
          inspections, AI findings or risk results.
        </p>
      </header>

      <section className="nx-section" id="system" aria-labelledby="system-heading">
        <SectionHeading
          id="system-heading"
          title="Live foundation status"
          description="Real connectivity reported by the implemented backend. No mock operational intelligence is rendered."
        />
        <div className="nx-status-grid" aria-live="polite" aria-busy={!status && !error}>
          <SystemStatusCard label="Backend" value={backend} detail={status?.service ?? "nirikshanx-backend"} />
          <SystemStatusCard label="PostgreSQL + PostGIS" value={database} detail="Authoritative data store" />
          <SystemStatusCard label="Redis" value={redis} detail="Disposable infrastructure" />
        </div>

        {error ? (
          <div style={{ marginTop: 12 }}>
            <InlineNotice tone="danger" title="Health check unavailable">
              {error}
            </InlineNotice>
          </div>
        ) : null}
      </section>

      <section className="nx-section" id="components" aria-labelledby="components-heading">
        <SectionHeading
          id="components-heading"
          title="Core interaction primitives"
          description="Shared controls use the same token, typography, focus and motion contracts across desktop and mobile."
        />

        <div className="nx-component-grid">
          <Card className="nx-component-panel" as="section">
            <h3>Actions and states</h3>
            <p>Neutral examples for component verification. They do not execute domain operations.</p>
            <div className="nx-button-row">
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Quiet action</Button>
              <Button variant="danger">Destructive</Button>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <InlineNotice title="Information pattern">Use concise, factual copy and preserve human decision-making.</InlineNotice>
              <InlineNotice tone="success" title="Success pattern">A completed system action can be acknowledged without exaggerating assurance.</InlineNotice>
            </div>
          </Card>

          <Card className="nx-component-panel" as="section">
            <h3>Form controls</h3>
            <p>Labels remain visible, hints remain subordinate, and native semantics are preserved.</p>
            <div className="nx-form-stack">
              <Field label="Example text field" htmlFor="design-text" hint="Component example only; no record is created.">
                <Input id="design-text" placeholder="Enter sample text" autoComplete="off" />
              </Field>

              <Field label="Example selection" htmlFor="design-select">
                <Select id="design-select" defaultValue="default">
                  <option value="default">Default option</option>
                  <option value="secondary">Secondary option</option>
                </Select>
              </Field>

              <Field label="Example notes" htmlFor="design-notes">
                <Textarea id="design-notes" placeholder="Write neutral component-review notes" />
              </Field>

              <Checkbox
                id="design-checkbox"
                label="Example checkbox"
                description="Keyboard and pointer interaction use the native checkbox contract."
              />
              <Switch
                id="design-switch"
                label="Example switch"
                description="The switch is a presentation of a native checkbox with role=switch."
              />
            </div>
          </Card>
        </div>
      </section>

      <section className="nx-section" id="tokens" aria-labelledby="tokens-heading">
        <SectionHeading
          id="tokens-heading"
          title="Semantic tokens"
          description="Meaning is centralized so product modules do not scatter one-off colors, radii, shadows or status styling."
        />

        <div className="nx-token-grid">
          <TokenSample name="Primary" variable="--nx-primary" value="Action / focus" />
          <TokenSample name="Surface" variable="--nx-surface" value="Readable content" />
          <TokenSample name="Success" variable="--nx-success" value="Confirmed success" />
          <TokenSample name="Danger" variable="--nx-danger" value="Error / destructive" />
        </div>

        <div className="nx-risk-row" aria-label="Risk semantic token examples">
          <div className="nx-risk-token nx-risk-token--low"><strong>risk-low</strong><span>Semantic token only</span></div>
          <div className="nx-risk-token nx-risk-token--medium"><strong>risk-medium</strong><span>Semantic token only</span></div>
          <div className="nx-risk-token nx-risk-token--high"><strong>risk-high</strong><span>Semantic token only</span></div>
          <div className="nx-risk-token nx-risk-token--critical"><strong>risk-critical</strong><span>Semantic token only</span></div>
        </div>
      </section>
    </AppShell>
  );
}

function SystemStatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="nx-status-card" as="article">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <div className="nx-status-card-footer">
        <StatusBadge tone={statusTone(value)}>{value}</StatusBadge>
        <p>{detail}</p>
      </div>
    </Card>
  );
}

function TokenSample({ name, variable, value }: { name: string; variable: string; value: string }) {
  const style = { "--token-color": `var(${variable})` } as CSSProperties;

  return (
    <div className="nx-token-sample" style={style}>
      <span aria-hidden="true" />
      <div>
        <strong>{name}</strong>
        <small>{variable} · {value}</small>
      </div>
    </div>
  );
}
