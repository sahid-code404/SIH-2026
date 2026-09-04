import type { ReactNode } from "react";
import { Card, StatusBadge } from "./primitives";

export function MapPanel({
  title = "Map",
  description,
  toolbar,
  children,
  emptyMessage = "Map data is not available.",
}: {
  title?: string;
  description?: string;
  toolbar?: ReactNode;
  children?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <Card className="nx-domain-panel" as="section">
      <header className="nx-domain-panel-header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {toolbar ? <div>{toolbar}</div> : null}
      </header>
      <div className="nx-map-panel-body">
        {children ?? <div className="nx-domain-empty">{emptyMessage}</div>}
      </div>
    </Card>
  );
}

export function EvidenceViewer({
  title = "Evidence",
  name,
  mimeType,
  sizeLabel,
  preview,
  actions,
}: {
  title?: string;
  name?: string;
  mimeType?: string;
  sizeLabel?: string;
  preview?: ReactNode;
  actions?: ReactNode;
}) {
  const hasEvidence = Boolean(name || preview);
  return (
    <Card className="nx-domain-panel" as="section">
      <header className="nx-domain-panel-header">
        <div>
          <h3>{title}</h3>
          {name ? <p>{name}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </header>
      {hasEvidence ? (
        <div className="nx-evidence-viewer-body">
          <div className="nx-evidence-preview">{preview ?? <span>Preview unavailable</span>}</div>
          <dl className="nx-evidence-meta">
            {mimeType ? <><dt>Type</dt><dd>{mimeType}</dd></> : null}
            {sizeLabel ? <><dt>Size</dt><dd>{sizeLabel}</dd></> : null}
          </dl>
        </div>
      ) : <div className="nx-domain-empty">No evidence selected.</div>}
    </Card>
  );
}

export function CCTVStatusCard({
  label,
  status,
  detail,
}: {
  label: string;
  status: "online" | "offline" | "degraded" | "unknown";
  detail?: string;
}) {
  const tone = status === "online" ? "success" : status === "degraded" ? "warning" : status === "offline" ? "danger" : "neutral";
  return (
    <Card className="nx-cctv-status-card" as="article">
      <div>
        <p>{label}</p>
        {detail ? <small>{detail}</small> : null}
      </div>
      <StatusBadge tone={tone}>{status}</StatusBadge>
    </Card>
  );
}

export function OfflineBanner({
  offline,
  pendingCount = 0,
  children,
}: {
  offline: boolean;
  pendingCount?: number;
  children?: ReactNode;
}) {
  if (!offline) return null;
  return (
    <div className="nx-offline-banner" role="status" aria-live="polite">
      <strong>Offline</strong>
      <span>{children ?? "Changes that support offline capture will sync when connectivity returns."}</span>
      {pendingCount > 0 ? <span>{pendingCount} pending</span> : null}
    </div>
  );
}

export function SyncIndicator({
  status,
  pendingCount = 0,
}: {
  status: "idle" | "syncing" | "synced" | "error";
  pendingCount?: number;
}) {
  const label = status === "syncing" ? "Syncing" : status === "synced" ? "Synced" : status === "error" ? "Sync error" : "Up to date";
  const tone = status === "error" ? "danger" : status === "syncing" ? "info" : status === "synced" ? "success" : "neutral";
  return (
    <span className="nx-sync-indicator" role="status" aria-live="polite">
      <StatusBadge tone={tone}>{label}</StatusBadge>
      {pendingCount > 0 ? <small>{pendingCount} pending</small> : null}
    </span>
  );
}
