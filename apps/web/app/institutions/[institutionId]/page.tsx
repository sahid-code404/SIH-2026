"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { InstitutionForm, type Institution, type InstitutionPayload } from "@/components/institution-form";
import { Button, Card, InlineNotice, StatusBadge } from "@/components/ui/primitives";

type AuthorizationView = { effectivePermissions: string[] };
type Membership = { id: string; userId: string; email: string; displayName: string; assignmentSource: string; assignedAt: string };

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function InstitutionDetailPage() {
  const params = useParams<{ institutionId: string }>();
  const institutionId = params.institutionId;
  const router = useRouter();
  const { status, request } = useAuth();
  const [authorization, setAuthorization] = useState<AuthorizationView | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canUpdate = authorization?.effectivePermissions.includes("institution.update") ?? false;

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [router, status]);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const [authResponse, institutionResponse] = await Promise.all([
        request("/api/v1/authz/me"),
        request(`/api/v1/institutions/${institutionId}`),
      ]);
      if (!authResponse.ok) throw new Error(await responseMessage(authResponse));
      if (!institutionResponse.ok) throw new Error(await responseMessage(institutionResponse));
      const auth = (await authResponse.json()) as AuthorizationView;
      const nextInstitution = (await institutionResponse.json()) as Institution;
      setAuthorization(auth);
      setInstitution(nextInstitution);
      if (auth.effectivePermissions.includes("institution.update")) {
        const membershipResponse = await request(`/api/v1/institutions/${institutionId}/memberships`);
        if (membershipResponse.ok) setMemberships((await membershipResponse.json()) as Membership[]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load institution");
    } finally {
      setLoading(false);
    }
  }, [institutionId, request, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function update(payload: InstitutionPayload) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request(`/api/v1/institutions/${institutionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setInstitution((await response.json()) as Institution);
      setEditOpen(false);
      setNotice("Institution record updated from authoritative user input.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Institution was not updated");
    } finally {
      setBusy(false);
    }
  }

  if (loading || status === "loading") {
    return <main className="nx-institutions-page"><p className="nx-auth-loading">Loading authorized institution…</p></main>;
  }

  if (!institution) {
    return (
      <main className="nx-institutions-page" id="main-content">
        <DetailHeader />
        <div className="nx-institution-width nx-institution-state">
          <InlineNotice tone="danger" title="Institution unavailable">{error ?? "This institution is not available in your authorized scope."}</InlineNotice>
        </div>
      </main>
    );
  }

  return (
    <main className="nx-institutions-page" id="main-content">
      <DetailHeader />

      <section className="nx-institution-width nx-institution-detail-hero">
        <div>
          <Link className="nx-back-link" href="/institutions">← Institution registry</Link>
          <span className="nx-page-meta">Canonical institution · {institution.code}</span>
          <h1>{institution.displayName}</h1>
          <p>{institution.legalName}</p>
        </div>
        <div className="nx-institution-detail-actions">
          <StatusBadge tone="neutral">{institution.status}</StatusBadge>
          <StatusBadge tone="info">{institution.verificationStatus}</StatusBadge>
          {canUpdate ? <Button onClick={() => setEditOpen((value) => !value)}>{editOpen ? "Close editor" : "Edit institution"}</Button> : null}
        </div>
      </section>

      {notice ? <div className="nx-institution-width"><InlineNotice tone="success" title="Saved">{notice}</InlineNotice></div> : null}
      {error ? <div className="nx-institution-width"><InlineNotice tone="danger" title="Request failed">{error}</InlineNotice></div> : null}

      {editOpen && canUpdate ? (
        <Card className="nx-institution-width nx-institution-editor" as="section">
          <div className="nx-institution-section-heading"><div><h2>Edit institution</h2><p>Only explicit institution fields can be updated. The server rejects cross-jurisdiction relocation without matching geographic authority.</p></div></div>
          <InstitutionForm value={institution} submitLabel="Save institution" busy={busy} onSubmit={update} onCancel={() => setEditOpen(false)} />
        </Card>
      ) : null}

      <div className="nx-institution-width nx-institution-detail-grid">
        <Card className="nx-institution-overview-card" as="section">
          <div className="nx-institution-section-heading"><div><h2>Overview</h2><p>Persisted canonical data only. Future risk, inspection, CCTV and attendance sections remain absent until their roadmap phases exist.</p></div></div>
          <dl className="nx-institution-detail-list">
            <Detail label="Institution type" value={institution.institutionType} />
            <Detail label="Registration number" value={institution.registrationNumber ?? "Not supplied"} />
            <Detail label="State" value={`${institution.stateName} · ${institution.stateCode}`} />
            <Detail label="District" value={`${institution.districtName} · ${institution.districtCode}`} />
            <Detail label="Address" value={`${institution.address} · ${institution.postalCode}`} />
            <Detail label="Verification status" value={institution.verificationStatus} />
          </dl>
        </Card>

        <Card className="nx-institution-overview-card" as="section">
          <div className="nx-institution-section-heading"><div><h2>Location & geofence</h2><p>Stored as PostGIS geography(Point,4326). Coordinates are evidence inputs, not an absolute proof of presence.</p></div></div>
          <dl className="nx-institution-detail-list">
            <Detail label="Latitude" value={institution.latitude.toFixed(6)} />
            <Detail label="Longitude" value={institution.longitude.toFixed(6)} />
            <Detail label="Geofence radius" value={`${institution.geofenceRadiusM} m`} />
          </dl>
        </Card>

        <Card className="nx-institution-overview-card" as="section">
          <div className="nx-institution-section-heading"><div><h2>Primary contact</h2><p>Structured contact fields rather than opaque JSON business data.</p></div></div>
          <dl className="nx-institution-detail-list">
            <Detail label="Name" value={institution.primaryContactName} />
            <Detail label="Email" value={institution.primaryContactEmail ?? "Not supplied"} />
            <Detail label="Phone" value={institution.primaryContactPhone ?? "Not supplied"} />
          </dl>
        </Card>

        <Card className="nx-institution-overview-card" as="section">
          <div className="nx-institution-section-heading"><div><h2>Record integrity</h2><p>Server-maintained lifecycle timestamps for the canonical record.</p></div></div>
          <dl className="nx-institution-detail-list">
            <Detail label="Created" value={dateTime(institution.createdAt)} />
            <Detail label="Updated" value={dateTime(institution.updatedAt)} />
            <Detail label="Institution ID" value={institution.id} mono />
          </dl>
        </Card>

        {canUpdate ? (
          <Card className="nx-institution-overview-card nx-membership-card" as="section">
            <div className="nx-institution-section-heading"><div><h2>Active memberships</h2><p>Membership provides ownership scope only; it never grants permissions by itself.</p></div></div>
            {memberships.length === 0 ? <p className="nx-muted-copy">No active institution memberships.</p> : (
              <div className="nx-membership-list">
                {memberships.map((membership) => (
                  <div key={membership.id}><div><strong>{membership.displayName}</strong><span>{membership.email}</span></div><small>Assigned {dateTime(membership.assignedAt)}</small></div>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "nx-mono" : undefined}>{value}</dd></div>;
}

function DetailHeader() {
  return (
    <header className="nx-institution-width nx-institution-header">
      <Link className="nx-auth-brand" href="/institutions"><span className="nx-brand-mark" aria-hidden="true">NX</span><span><strong>NirikshanX</strong><small>Institution overview</small></span></Link>
      <nav aria-label="Institution navigation"><Link href="/account">Account & security</Link><Link href="/">System</Link></nav>
    </header>
  );
}
