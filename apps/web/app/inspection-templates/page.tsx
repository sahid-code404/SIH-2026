"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Button, Card, Field, InlineNotice, Input, StatusBadge, Textarea } from "@/components/ui/primitives";

type TemplateSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  latestPublishedVersion: number | null;
  draftVersion: number | null;
  createdAt: string;
  updatedAt: string;
};

type TemplatePage = {
  items: TemplateSummary[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
};

type TemplateDetail = {
  template: TemplateSummary;
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function versionLabel(template: TemplateSummary) {
  if (template.draftVersion) return `Draft v${template.draftVersion}`;
  if (template.latestPublishedVersion) return `Published v${template.latestPublishedVersion}`;
  return "No published version";
}

export default function InspectionTemplatesPage() {
  const router = useRouter();
  const { request } = useAuth();
  const { authorization, privilegeRestricted } = useWorkspace();
  const [data, setData] = useState<TemplatePage | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const permissions = useMemo(() => new Set(authorization?.effectivePermissions ?? []), [authorization]);
  const canRead = permissions.has("inspection.read");
  const canAuthor = permissions.has("inspection.create");

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), size: "20" });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      const response = await request(`/api/v1/inspection-templates?${params.toString()}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      setData((await response.json()) as TemplatePage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load inspection templates");
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
    if (!data || data.total === 0) return "0 templates";
    const first = data.page * data.size + 1;
    const last = Math.min(data.total, first + data.items.length - 1);
    return `${first}–${last} of ${data.total}`;
  }, [data]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSubmittedQuery(query);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBusy(true);
    setError(null);
    try {
      const response = await request("/api/v1/inspection-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, description: description.trim() || null }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const created = (await response.json()) as TemplateDetail;
      router.push(`/inspection-templates/${created.template.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inspection template was not created");
    } finally {
      setCreateBusy(false);
    }
  }

  if (!authorization) {
    return <main className="nx-template-page" id="main-content"><p className="nx-auth-loading">Resolving template access…</p></main>;
  }

  if (!canRead) {
    return (
      <main className="nx-template-page" id="main-content">
        <section className="nx-template-hero">
          <span className="nx-page-meta">Inspection standards</span>
          <h1>Inspection templates</h1>
        </section>
        <InlineNotice tone="danger" title="Template access is unavailable">
          Your current effective permissions do not include inspection.read. A privileged permission may also be withheld until a fresh MFA sign-in.
        </InlineNotice>
      </main>
    );
  }

  return (
    <main className="nx-template-page" id="main-content">
      <section className="nx-template-hero">
        <div>
          <span className="nx-page-meta">Inspection standards</span>
          <h1>Inspection templates</h1>
          <p>Build reusable, versioned questionnaires without hardcoding inspection questions. Published versions remain fixed for later inspection records.</p>
        </div>
        {canAuthor ? <Button onClick={() => setCreateOpen((value) => !value)}>{createOpen ? "Close form" : "New template"}</Button> : null}
      </section>

      {privilegeRestricted && authorization.withheldPermissions.includes("inspection.create") ? (
        <InlineNotice tone="warning" title="Authoring is restricted in this session">
          Template reading remains available, but privileged authoring actions are withheld until the required MFA policy is satisfied.
        </InlineNotice>
      ) : null}
      {error ? <InlineNotice tone="danger" title="Template request failed">{error}</InlineNotice> : null}

      {createOpen && canAuthor ? (
        <Card className="nx-template-create" as="section">
          <div className="nx-template-section-heading">
            <div>
              <h2>Create inspection template</h2>
              <p>This creates a stable template identity and an editable draft version 1.</p>
            </div>
          </div>
          <form className="nx-template-create-form" onSubmit={create}>
            <Field label="Template code" htmlFor="template-code" hint="Stable code, for example SAFETY_AUDIT. It is not a question identifier.">
              <Input id="template-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={64} required />
            </Field>
            <Field label="Template name" htmlFor="template-name">
              <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required />
            </Field>
            <Field label="Description" htmlFor="template-description">
              <Textarea id="template-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} />
            </Field>
            <div className="nx-template-form-actions">
              <Button type="submit" disabled={createBusy}>{createBusy ? "Creating…" : "Create draft"}</Button>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="nx-template-registry" aria-busy={loading}>
        <div className="nx-template-toolbar">
          <form className="nx-template-search" onSubmit={search} role="search">
            <label className="nx-visually-hidden" htmlFor="template-search">Search inspection templates</label>
            <Input id="template-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search template code, name or description" maxLength={160} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <span className="nx-template-range" aria-live="polite">{loading ? "Loading…" : range}</span>
        </div>

        {!loading && data?.items.length === 0 ? (
          <Card className="nx-template-empty" as="section">
            <span className="nx-template-empty-mark" aria-hidden="true">＋</span>
            <h2>No inspection templates yet</h2>
            <p>{canAuthor ? "Create the first reusable template, then add sections and typed questions in its draft." : "No published inspection templates are available to this account yet."}</p>
          </Card>
        ) : null}

        {data && data.items.length > 0 ? (
          <>
            <div className="nx-template-grid">
              {data.items.map((template) => (
                <Card className="nx-template-card" as="article" key={template.id}>
                  <div className="nx-template-card-top">
                    <span className="nx-template-code">{template.code}</span>
                    <StatusBadge tone={template.draftVersion ? "warning" : template.latestPublishedVersion ? "success" : "neutral"}>
                      {versionLabel(template)}
                    </StatusBadge>
                  </div>
                  <div>
                    <h2>{template.name}</h2>
                    <p>{template.description || "No description provided."}</p>
                  </div>
                  <div className="nx-template-card-footer">
                    <span>{template.latestPublishedVersion ? `Latest published v${template.latestPublishedVersion}` : "Not published"}</span>
                    <Link href={`/inspection-templates/${template.id}`}>{canAuthor ? "Open builder" : "View versions"}</Link>
                  </div>
                </Card>
              ))}
            </div>

            <nav className="nx-template-pagination" aria-label="Template pages">
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