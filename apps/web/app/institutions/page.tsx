"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { InstitutionForm, type Institution, type InstitutionPayload } from "@/components/institution-form";
import { Button, Card, InlineNotice, Input, StatusBadge } from "@/components/ui/primitives";

type AuthorizationView = {
  effectivePermissions: string[];
  mfaRequired: boolean;
  mfaSatisfied: boolean;
};

type InstitutionPage = {
  items: Institution[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function tone(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.includes("VERIFIED") || normalized === "ACTIVE") return "success" as const;
  if (normalized.includes("PENDING") || normalized.includes("REVIEW")) return "warning" as const;
  if (normalized.includes("DISABLED") || normalized.includes("SUSPENDED") || normalized.includes("REJECTED")) return "danger" as const;
  return "neutral" as const;
}

export default function InstitutionsPage() {
  const router = useRouter();
  const { status, request } = useAuth();
  const [authorization, setAuthorization] = useState<AuthorizationView | null>(null);
  const [data, setData] = useState<InstitutionPage | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = authorization?.effectivePermissions.includes("institution.read") ?? false;
  const canCreate = authorization?.effectivePermissions.includes("institution.create") ?? false;

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void request("/api/v1/authz/me")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const body = (await response.json()) as AuthorizationView;
        if (!cancelled) setAuthorization(body);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to resolve authorization");
      });
    return () => {
      cancelled = true;
    };
  }, [request, status]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), size: "20", sort: "displayName", direction: "asc" });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      const response = await request(`/api/v1/institutions?${params.toString()}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      setData((await response.json()) as InstitutionPage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load institutions");
    } finally {
      setLoading(false);
    }
  }, [canRead, page, request, submittedQuery]);

  useEffect(() => {
    if (!authorization || !canRead) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authorization, canRead, load]);

  const range = useMemo(() => {
    if (!data || data.total === 0) return "0 institutions";
    const first = data.page * data.size + 1;
    const last = Math.min(data.total, first + data.items.length - 1);
    return `${first}–${last} of ${data.total}`;
  }, [data]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSubmittedQuery(query);
  }

  async function create(payload: InstitutionPayload) {
    setCreateBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request("/api/v1/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const created = (await response.json()) as Institution;
      setCreateOpen(false);
      setNotice(`Created ${created.displayName}.`);
      await load();
      router.push(`/institutions/${created.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Institution was not created");
    } finally {
      setCreateBusy(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && !authorization && !error)) {
    return <main className="nx-institutions-page"><p className="nx-auth-loading">Resolving institution access…</p></main>;
  }

  if (authorization && !canRead) {
    return (
      <main className="nx-institutions-page" id="main-content">
        <InstitutionHeader />
        <div className="nx-institution-width nx-institution-state">
          <InlineNotice tone="danger" title="Institution access is not available">
            Your current effective permissions do not include institution.read. Privileged permissions may also remain withheld until the required MFA policy is satisfied.
          </InlineNotice>
        </div>
      </main>
    );
  }

  return (
    <main className="nx-institutions-page" id="main-content">
      <InstitutionHeader />

      <section className="nx-institution-width nx-institution-hero">
        <div>
          <span className="nx-page-meta">Phase 6 · Canonical institutions</span>
          <h1>Institution registry</h1>
          <p>Only institutions inside your current jurisdiction or active institution memberships are returned by the server.</p>
        </div>
        {canCreate ? <Button onClick={() => setCreateOpen((value) => !value)}>{createOpen ? "Close form" : "Create institution"}</Button> : null}
      </section>

      {authorization?.mfaRequired && !authorization.mfaSatisfied ? (
        <div className="nx-institution-width">
          <InlineNotice tone="warning" title="MFA policy is not satisfied">
            Privileged institution permissions are withheld for this session. Complete a fresh MFA sign-in before performing privileged actions.
          </InlineNotice>
        </div>
      ) : null}
      {notice ? <div className="nx-institution-width"><InlineNotice tone="success" title="Institution registry updated">{notice}</InlineNotice></div> : null}
      {error ? <div className="nx-institution-width"><InlineNotice tone="danger" title="Institution request failed">{error}</InlineNotice></div> : null}

      {createOpen && canCreate ? (
        <Card className="nx-institution-width nx-institution-editor" as="section">
          <div className="nx-institution-section-heading">
            <div><h2>Create canonical institution</h2><p>All values are persisted. Policy code fields intentionally require an authoritative code rather than a guessed dropdown.</p></div>
          </div>
          <InstitutionForm submitLabel="Create institution" busy={createBusy} onSubmit={create} onCancel={() => setCreateOpen(false)} />
        </Card>
      ) : null}

      <section className="nx-institution-width nx-institution-registry" aria-busy={loading}>
        <div className="nx-institution-toolbar">
          <form className="nx-institution-search" onSubmit={search} role="search">
            <label htmlFor="institution-search" className="nx-visually-hidden">Search institutions</label>
            <Input id="institution-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code or registration number" maxLength={160} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <span className="nx-institution-range" aria-live="polite">{loading ? "Loading…" : range}</span>
        </div>

        {!loading && data?.items.length === 0 ? (
          <Card className="nx-institution-empty" as="div">
            <h2>No institutions in your authorized scope</h2>
            <p>Try a different search. NirikshanX does not show records outside your active jurisdiction or membership scope.</p>
          </Card>
        ) : null}

        {data && data.items.length > 0 ? (
          <>
            <div className="nx-institution-table-wrap">
              <table className="nx-institution-table">
                <thead><tr><th>Institution</th><th>Geography</th><th>Type</th><th>Status</th><th>Verification</th><th><span className="nx-visually-hidden">Open</span></th></tr></thead>
                <tbody>
                  {data.items.map((institution) => (
                    <tr key={institution.id}>
                      <td><strong>{institution.displayName}</strong><span>{institution.code}{institution.registrationNumber ? ` · ${institution.registrationNumber}` : ""}</span></td>
                      <td><strong>{institution.districtName}</strong><span>{institution.stateName}</span></td>
                      <td>{institution.institutionType}</td>
                      <td><StatusBadge tone={tone(institution.status)}>{institution.status}</StatusBadge></td>
                      <td><StatusBadge tone={tone(institution.verificationStatus)}>{institution.verificationStatus}</StatusBadge></td>
                      <td><Link className="nx-row-link" href={`/institutions/${institution.id}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="nx-institution-card-list">
              {data.items.map((institution) => (
                <Card className="nx-institution-card" as="article" key={institution.id}>
                  <div className="nx-institution-card-heading"><div><strong>{institution.displayName}</strong><span>{institution.code}</span></div><StatusBadge tone={tone(institution.status)}>{institution.status}</StatusBadge></div>
                  <dl><div><dt>District</dt><dd>{institution.districtName}, {institution.stateName}</dd></div><div><dt>Type</dt><dd>{institution.institutionType}</dd></div><div><dt>Verification</dt><dd>{institution.verificationStatus}</dd></div></dl>
                  <Link className="nx-row-link" href={`/institutions/${institution.id}`}>Open institution</Link>
                </Card>
              ))}
            </div>

            <nav className="nx-institution-pagination" aria-label="Institution pages">
              <Button variant="secondary" size="sm" disabled={data.page <= 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
              <span>Page {data.totalPages === 0 ? 0 : data.page + 1} of {data.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={data.page + 1 >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </nav>
          </>
        ) : null}
      </section>
    </main>
  );
}

function InstitutionHeader() {
  return (
    <header className="nx-institution-width nx-institution-header">
      <Link className="nx-auth-brand" href="/institutions">
        <span className="nx-brand-mark" aria-hidden="true">NX</span>
        <span><strong>NirikshanX</strong><small>Institution registry</small></span>
      </Link>
      <nav aria-label="Institution navigation"><Link href="/account">Account & security</Link><Link href="/">System</Link></nav>
    </header>
  );
}
