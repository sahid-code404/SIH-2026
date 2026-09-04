import type { ReactNode } from "react";
import { Card, StatusBadge } from "./primitives";

export function StatCard({
  label,
  value,
  description,
  footer,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="nx-metric-card" as="article">
      <p className="nx-metric-label">{label}</p>
      <div className="nx-metric-value">{value}</div>
      {description ? <p className="nx-metric-description">{description}</p> : null}
      {footer ? <div className="nx-metric-footer">{footer}</div> : null}
    </Card>
  );
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export function RiskCard({
  title,
  level,
  children,
  explanation,
}: {
  title: string;
  level: RiskLevel;
  children?: ReactNode;
  explanation?: string;
}) {
  return (
    <Card className={`nx-risk-card nx-risk-card--${level}`} as="article">
      <div className="nx-risk-card-header">
        <strong>{title}</strong>
        <span className="nx-risk-level">{level}</span>
      </div>
      {children ? <div className="nx-risk-card-body">{children}</div> : null}
      {explanation ? <p className="nx-risk-card-explanation">{explanation}</p> : null}
    </Card>
  );
}

export function AnomalyCard({
  title,
  state,
  description,
  confidence,
  action,
}: {
  title: string;
  state: "unreviewed" | "reviewed" | "inconclusive";
  description: string;
  confidence?: string;
  action?: ReactNode;
}) {
  const tone = state === "reviewed" ? "success" : state === "inconclusive" ? "warning" : "info";
  return (
    <Card className="nx-anomaly-card" as="article">
      <div className="nx-anomaly-card-header">
        <strong>{title}</strong>
        <StatusBadge tone={tone}>{state}</StatusBadge>
      </div>
      <p>{description}</p>
      {confidence ? <small>{confidence}</small> : null}
      {action ? <div className="nx-anomaly-card-action">{action}</div> : null}
    </Card>
  );
}
