"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  EnrollmentForm,
  ProjectForm,
  SchemeForm,
  type Enrollment,
  type EnrollmentCreatePayload,
  type EnrollmentUpdatePayload,
  type InstitutionOption,
  type Project,
  type ProjectCreatePayload,
  type Scheme,
  type SchemePayload,
} from "@/components/program-forms";
import { Button, Card, InlineNotice, Input, StatusBadge } from "@/components/ui/primitives";

type AuthorizationView = { effectivePermissions: string[]; mfaRequired: boolean; mfaSatisfied: boolean };
type PageView<T> = { items: T[]; total: number; page: number; size: number; totalPages: number };
type InstitutionPage = { items: InstitutionOption[]; total: number; page: number; size: number; totalPages: number };
type Tab = "schemes" | "enrollments" | "projects";

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
  if (normalized.includes("ACTIVE") || normalized.includes("COMPLETE") || normalized.includes("APPROVED")) return "success" as const;
  if (normalized.includes("PENDING") || normalized.includes("PLANNED") || normalized.includes("REVIEW")) return "warning" as const;
  if (normalized.includes("SUSPEND") || normalized.includes("CANCEL") || normalized.includes("REJECT")) return "danger" as const;
  return "neutral" as const;
}

function range<T>(data: PageView<T> | null, label: string) {
  if (!data || data.total === 0) return `0 ${label}`;
  const first = data.page * data.size + 1;
  const last = Math.min(data.total, first + data.items.length - 1);
  return `${first}–${last} of ${data.total}`;
}

export default function ProgramsPage() {
  const router = useRouter();
  const { status, request } = useAuth();
  const [authorization, setAuthorization] = useState<AuthorizationView | null>(null);
  const [tab, setTab] = useState<Tab>("schemes");
  const [schemes, setSchemes] = useState<PageView<Scheme> | null>(null);
  const [enrollments, setEnrollments] = useState<PageView<Enrollment> | null>(null);
  const [projects, setProjects] = useState<PageView<Project> | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [schemeQuery, setSchemeQuery] = useState("");
  const [submittedSchemeQuery, setSubmittedSchemeQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [submittedProjectQuery, setSubmittedProjectQuery] = useState("");
  const [schemePage, setSchemePage] = useState(0);
  const [enrollmentPage, setEnrollmentPage] = useState(0);
  const [projectPage, setProjectPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<"scheme-create" | "scheme-edit" | "enrollment-create" | "enrollment-edit" | "project-create" | null>(null);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);

  const permissions = useMemo(() => new Set(authorization?.effectivePermissions ?? []), [authorization]);
  const canSchemeRead = permissions.has("scheme.read");
  const canSchemeCreate = permissions.has("scheme.create");
  const canSchemeUpdate = permissions.has("scheme.update");
  const canEnrollmentRead = permissions.has("enrollment.read");
  const canEnrollmentCreate = permissions.has("enrollment.create");
  const canEnrollmentUpdate = permissions.has("enrollment.update");
  const canProjectRead = permissions.has("project.read");
  const canProjectCreate = permissions.has("project.create");
  const canInstitutionRead = permissions.has("institution.read");
  const canReadAny = canSchemeRead || canEnrollmentRead || canProjectRead;

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
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to resolve program authorization");
      });
    return () => { cancelled = true; };
  }, [request, status]);

  const load = useCallback(async () => {
    if (!authorization) return;
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<void>[] = [];
      if (canSchemeRead) {
        const params = new URLSearchParams({ page: String(schemePage), size: "20", sort: "name", direction: "asc" });
        if (submittedSchemeQuery.trim()) params.set("q", submittedSchemeQuery.trim());
        tasks.push(request(`/api/v1/schemes?${params}`).then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          setSchemes((await response.json()) as PageView<Scheme>);
        }));
      }
      if (canEnrollmentRead) {
        const params = new URLSearchParams({ page: String(enrollmentPage), size: "20" });
        tasks.push(request(`/api/v1/enrollments?${params}`).then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          setEnrollments((await response.json()) as PageView<Enrollment>);
        }));
      }
      if (canProjectRead) {
        const params = new URLSearchParams({ page: String(projectPage), size: "20", sort: "title", direction: "asc" });
        if (submittedProjectQuery.trim()) params.set("q", submittedProjectQuery.trim());
        tasks.push(request(`/api/v1/projects?${params}`).then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          setProjects((await response.json()) as PageView<Project>);
        }));
      }
      if (canInstitutionRead && canEnrollmentCreate) {
        tasks.push(request("/api/v1/institutions?page=0&size=100&sort=displayName&direction=asc").then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as InstitutionPage;
          setInstitutions(body.items);
        }));
      }
      await Promise.all(tasks);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load program data");
    } finally {
      setLoading(false);
    }
  }, [authorization, canEnrollmentCreate, canEnrollmentRead, canInstitutionRead, canProjectRead, canSchemeRead, enrollmentPage, projectPage, request, schemePage, submittedProjectQuery, submittedSchemeQuery]);

  useEffect(() => {
    if (!authorization || !canReadAny) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authorization, canReadAny, load]);

  useEffect(() => {
    if (!authorization) return;
    const allowedTabs: Tab[] = [];
    if (canSchemeRead) allowedTabs.push("schemes");
    if (canEnrollmentRead) allowedTabs.push("enrollments");
    if (canProjectRead) allowedTabs.push("projects");
    if (!allowedTabs.includes(tab) && allowedTabs[0]) setTab(allowedTabs[0]);
  }, [authorization, canEnrollmentRead, canProjectRead, canSchemeRead, tab]);

  function openEditor(next: typeof editor) {
    setEditor(next);
    setEditingScheme(null);
    setEditingEnrollment(null);
    setError(null);
    setNotice(null);
  }

  async function saveScheme(payload: SchemePayload) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const isEdit = editor === "scheme-edit" && editingScheme;
      const response = await request(isEdit ? `/api/v1/schemes/${editingScheme.id}` : "/api/v1/schemes", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as Scheme;
      setNotice(`${isEdit ? "Updated" : "Created"} ${saved.name}.`);
      setEditor(null);
      setEditingScheme(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scheme was not saved");
    } finally {
      setBusy(false);
    }
  }

  async function saveEnrollment(payload: EnrollmentCreatePayload | EnrollmentUpdatePayload) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const isEdit = editor === "enrollment-edit" && editingEnrollment;
      const response = await request(isEdit ? `/api/v1/enrollments/${editingEnrollment.id}` : "/api/v1/enrollments", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as Enrollment;
      setNotice(`${isEdit ? "Updated" : "Created"} ${saved.institutionName} / ${saved.schemeName} enrollment.`);
      setEditor(null);
      setEditingEnrollment(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enrollment was not saved");
    } finally {
      setBusy(false);
    }
  }

  async function createProject(payload: ProjectCreatePayload) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as Project;
      setEditor(null);
      setNotice(`Created ${saved.title}.`);
      await load();
      router.push(`/projects/${saved.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Project was not created");
    } finally {
      setBusy(false);
    }
  }

  function submitSchemeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSchemePage(0);
    setSubmittedSchemeQuery(schemeQuery);
  }

  function submitProjectSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectPage(0);
    setSubmittedProjectQuery(projectQuery);
  }

  if (status === "loading" || (status === "authenticated" && !authorization && !error)) {
    return <main className="nx-programs-page"><p className="nx-auth-loading">Resolving program access…</p></main>;
  }

  if (authorization && !canReadAny) {
    return (
      <main className="nx-programs-page" id="main-content">
        <ProgramsHeader />
        <div className="nx-program-width nx-program-state">
          <InlineNotice tone="danger" title="Program access is not available">
            Your current effective permissions do not include scheme.read, enrollment.read or project.read.
          </InlineNotice>
        </div>
      </main>
    );
  }

  const schemeItems = schemes?.items ?? [];
  const enrollmentItems = enrollments?.items ?? [];
  const projectItems = projects?.items ?? [];

  return (
    <main className="nx-programs-page" id="main-content">
      <ProgramsHeader />

      <section className="nx-program-width nx-program-hero">
        <div>
          <h1>Programs & projects</h1>
          <p>One scheme-agnostic registry links authorized institutions to schemes, projects and ordered milestones without embedding one scheme&apos;s rules in shared data.</p>
        </div>
      </section>

      {authorization?.mfaRequired && !authorization.mfaSatisfied ? (
        <div className="nx-program-width nx-program-state"><InlineNotice tone="warning" title="MFA policy is not satisfied">Privileged program permissions remain withheld until a fresh MFA-authenticated session is established.</InlineNotice></div>
      ) : null}
      {notice ? <div className="nx-program-width nx-program-state"><InlineNotice tone="success" title="Program registry updated">{notice}</InlineNotice></div> : null}
      {error ? <div className="nx-program-width nx-program-state"><InlineNotice tone="danger" title="Program request failed">{error}</InlineNotice></div> : null}

      <div className="nx-program-width nx-program-tabs" role="tablist" aria-label="Program registry sections">
        {canSchemeRead ? <Button variant={tab === "schemes" ? "primary" : "ghost"} onClick={() => setTab("schemes")} role="tab" aria-selected={tab === "schemes"}>Schemes</Button> : null}
        {canEnrollmentRead ? <Button variant={tab === "enrollments" ? "primary" : "ghost"} onClick={() => setTab("enrollments")} role="tab" aria-selected={tab === "enrollments"}>Enrollments</Button> : null}
        {canProjectRead ? <Button variant={tab === "projects" ? "primary" : "ghost"} onClick={() => setTab("projects")} role="tab" aria-selected={tab === "projects"}>Projects</Button> : null}
      </div>

      {editor === "scheme-create" || editor === "scheme-edit" ? (
        <Card className="nx-program-width nx-program-editor" as="section">
          <ProgramSectionHeading title={editor === "scheme-edit" ? "Edit scheme" : "Create scheme"} description="Scheme status and codes remain normalized free policy codes; the UI does not invent an authoritative government catalog." />
          <SchemeForm value={editingScheme} busy={busy} submitLabel={editingScheme ? "Save scheme" : "Create scheme"} onSubmit={saveScheme} onCancel={() => setEditor(null)} />
        </Card>
      ) : null}

      {editor === "enrollment-create" || editor === "enrollment-edit" ? (
        <Card className="nx-program-width nx-program-editor" as="section">
          <ProgramSectionHeading title={editingEnrollment ? "Edit enrollment" : "Create enrollment"} description="Enrollment scope is inherited from the selected institution. Ending an enrollment preserves its history." />
          {!editingEnrollment && (institutions.length === 0 || schemeItems.length === 0) ? (
            <InlineNotice tone="warning" title="Enrollment prerequisites unavailable">At least one authorized institution and one readable scheme are required before an enrollment can be created.</InlineNotice>
          ) : (
            <EnrollmentForm value={editingEnrollment} institutions={institutions} schemes={schemeItems} busy={busy} onSubmit={saveEnrollment} onCancel={() => setEditor(null)} />
          )}
        </Card>
      ) : null}

      {editor === "project-create" ? (
        <Card className="nx-program-width nx-program-editor" as="section">
          <ProgramSectionHeading title="Create project" description="The selected active enrollment is the canonical parent; institution and scheme are never duplicated as unchecked project strings." />
          {enrollmentItems.filter((item) => !item.endedOn).length === 0 ? (
            <InlineNotice tone="warning" title="No active enrollment available">Create or obtain access to an active institution scheme enrollment before creating a project.</InlineNotice>
          ) : (
            <ProjectForm enrollments={enrollmentItems} busy={busy} onSubmit={(payload) => createProject(payload as ProjectCreatePayload)} onCancel={() => setEditor(null)} />
          )}
        </Card>
      ) : null}

      {tab === "schemes" && canSchemeRead ? (
        <section className="nx-program-width nx-program-registry" aria-busy={loading}>
          <ProgramSectionHeading
            title="Scheme catalog"
            description="Global canonical definitions. Search is server-side and no scheme-specific columns are assumed."
            action={canSchemeCreate ? <Button onClick={() => openEditor("scheme-create")}>Create scheme</Button> : null}
          />
          <div className="nx-program-toolbar">
            <form className="nx-program-search" onSubmit={submitSchemeSearch} role="search">
              <label htmlFor="scheme-search" className="nx-visually-hidden">Search schemes</label>
              <Input id="scheme-search" value={schemeQuery} onChange={(event) => setSchemeQuery(event.target.value)} placeholder="Search scheme code or name" maxLength={160} />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <span>{loading ? "Loading…" : range(schemes, "schemes")}</span>
          </div>
          {!loading && schemeItems.length === 0 ? <ProgramEmpty title="No schemes found" copy="No scheme records match this search. NirikshanX does not seed a fake production scheme catalog." /> : null}
          {schemeItems.length > 0 ? (
            <>
              <div className="nx-program-table-wrap"><table className="nx-program-table"><thead><tr><th>Scheme</th><th>Status</th><th>Effective period</th><th><span className="nx-visually-hidden">Actions</span></th></tr></thead><tbody>
                {schemeItems.map((scheme) => <tr key={scheme.id}><td><strong>{scheme.name}</strong><span>{scheme.code}{scheme.shortName ? ` · ${scheme.shortName}` : ""}</span></td><td><StatusBadge tone={tone(scheme.status)}>{scheme.status}</StatusBadge></td><td>{scheme.effectiveFrom ?? "Not set"} → {scheme.effectiveTo ?? "Open"}</td><td>{canSchemeUpdate ? <button className="nx-row-link nx-link-button" onClick={() => { setEditingScheme(scheme); setEditor("scheme-edit"); }}>Edit</button> : null}</td></tr>)}
              </tbody></table></div>
              <div className="nx-program-card-list">{schemeItems.map((scheme) => <Card className="nx-program-card" as="article" key={scheme.id}><div className="nx-program-card-heading"><div><strong>{scheme.name}</strong><span>{scheme.code}</span></div><StatusBadge tone={tone(scheme.status)}>{scheme.status}</StatusBadge></div><p>{scheme.description ?? "No description supplied."}</p><div className="nx-program-card-actions">{canSchemeUpdate ? <Button variant="ghost" size="sm" onClick={() => { setEditingScheme(scheme); setEditor("scheme-edit"); }}>Edit scheme</Button> : null}</div></Card>)}</div>
              <Pager page={schemes?.page ?? 0} totalPages={schemes?.totalPages ?? 0} loading={loading} onPage={setSchemePage} />
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "enrollments" && canEnrollmentRead ? (
        <section className="nx-program-width nx-program-registry" aria-busy={loading}>
          <ProgramSectionHeading
            title="Institution enrollments"
            description="Rows are filtered in PostgreSQL by the parent institution&apos;s live jurisdiction or exact active membership."
            action={canEnrollmentCreate ? <Button onClick={() => openEditor("enrollment-create")}>Create enrollment</Button> : null}
          />
          <div className="nx-program-toolbar"><span>{loading ? "Loading…" : range(enrollments, "enrollments")}</span></div>
          {!loading && enrollmentItems.length === 0 ? <ProgramEmpty title="No enrollments in your authorized scope" copy="No accessible institution scheme enrollment is available." /> : null}
          {enrollmentItems.length > 0 ? (
            <>
              <div className="nx-program-table-wrap"><table className="nx-program-table"><thead><tr><th>Institution</th><th>Scheme</th><th>Status</th><th>Dates</th><th><span className="nx-visually-hidden">Actions</span></th></tr></thead><tbody>
                {enrollmentItems.map((enrollment) => <tr key={enrollment.id}><td><strong>{enrollment.institutionName}</strong><span>{enrollment.institutionCode}</span></td><td><strong>{enrollment.schemeName}</strong><span>{enrollment.enrollmentCode ?? enrollment.schemeCode}</span></td><td><StatusBadge tone={tone(enrollment.status)}>{enrollment.status}</StatusBadge></td><td>{enrollment.enrolledOn} → {enrollment.endedOn ?? "Active"}</td><td>{canEnrollmentUpdate ? <button className="nx-row-link nx-link-button" onClick={() => { setEditingEnrollment(enrollment); setEditor("enrollment-edit"); }}>Edit</button> : null}</td></tr>)}
              </tbody></table></div>
              <div className="nx-program-card-list">{enrollmentItems.map((enrollment) => <Card className="nx-program-card" as="article" key={enrollment.id}><div className="nx-program-card-heading"><div><strong>{enrollment.institutionName}</strong><span>{enrollment.institutionCode}</span></div><StatusBadge tone={tone(enrollment.status)}>{enrollment.status}</StatusBadge></div><dl><div><dt>Scheme</dt><dd>{enrollment.schemeName}</dd></div><div><dt>Enrolled</dt><dd>{enrollment.enrolledOn}</dd></div><div><dt>Ended</dt><dd>{enrollment.endedOn ?? "Active"}</dd></div></dl>{canEnrollmentUpdate ? <div className="nx-program-card-actions"><Button variant="ghost" size="sm" onClick={() => { setEditingEnrollment(enrollment); setEditor("enrollment-edit"); }}>Edit enrollment</Button></div> : null}</Card>)}</div>
              <Pager page={enrollments?.page ?? 0} totalPages={enrollments?.totalPages ?? 0} loading={loading} onPage={setEnrollmentPage} />
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "projects" && canProjectRead ? (
        <section className="nx-program-width nx-program-registry" aria-busy={loading}>
          <ProgramSectionHeading
            title="Projects"
            description="Project visibility and totals are server-scoped through each project&apos;s canonical enrollment and institution."
            action={canProjectCreate ? <Button onClick={() => openEditor("project-create")}>Create project</Button> : null}
          />
          <div className="nx-program-toolbar">
            <form className="nx-program-search" onSubmit={submitProjectSearch} role="search">
              <label htmlFor="project-search" className="nx-visually-hidden">Search projects</label>
              <Input id="project-search" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Search project code or title" maxLength={160} />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <span>{loading ? "Loading…" : range(projects, "projects")}</span>
          </div>
          {!loading && projectItems.length === 0 ? <ProgramEmpty title="No projects in your authorized scope" copy="No project matches this search and current institution scope." /> : null}
          {projectItems.length > 0 ? (
            <>
              <div className="nx-program-table-wrap"><table className="nx-program-table"><thead><tr><th>Project</th><th>Institution</th><th>Scheme</th><th>Status</th><th><span className="nx-visually-hidden">Open</span></th></tr></thead><tbody>
                {projectItems.map((project) => <tr key={project.id}><td><strong>{project.title}</strong><span>{project.code}</span></td><td><strong>{project.institutionName}</strong><span>{project.institutionCode}</span></td><td>{project.schemeName}</td><td><StatusBadge tone={tone(project.status)}>{project.status}</StatusBadge></td><td><Link className="nx-row-link" href={`/projects/${project.id}`}>Open</Link></td></tr>)}
              </tbody></table></div>
              <div className="nx-program-card-list">{projectItems.map((project) => <Card className="nx-program-card" as="article" key={project.id}><div className="nx-program-card-heading"><div><strong>{project.title}</strong><span>{project.code}</span></div><StatusBadge tone={tone(project.status)}>{project.status}</StatusBadge></div><dl><div><dt>Institution</dt><dd>{project.institutionName}</dd></div><div><dt>Scheme</dt><dd>{project.schemeName}</dd></div><div><dt>Planned</dt><dd>{project.plannedStartOn ?? "—"} → {project.plannedEndOn ?? "—"}</dd></div></dl><Link className="nx-row-link" href={`/projects/${project.id}`}>Open project</Link></Card>)}</div>
              <Pager page={projects?.page ?? 0} totalPages={projects?.totalPages ?? 0} loading={loading} onPage={setProjectPage} />
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function ProgramsHeader() {
  return (
    <header className="nx-program-width nx-program-header">
      <Link className="nx-auth-brand" href="/programs" aria-label="NirikshanX programs">
        <span className="nx-brand-mark" aria-hidden="true">NX</span>
        <span><strong>NirikshanX</strong><small>Programs & projects</small></span>
      </Link>
      <nav aria-label="Program navigation"><Link href="/institutions">Institutions</Link><Link href="/account">Account & security</Link><Link href="/">System</Link></nav>
    </header>
  );
}

function ProgramSectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="nx-program-section-heading"><div><h2>{title}</h2><p>{description}</p></div>{action ? <div>{action}</div> : null}</div>;
}

function ProgramEmpty({ title, copy }: { title: string; copy: string }) {
  return <Card className="nx-program-empty"><h3>{title}</h3><p>{copy}</p></Card>;
}

function Pager({ page, totalPages, loading, onPage }: { page: number; totalPages: number; loading: boolean; onPage: (page: number) => void }) {
  return <nav className="nx-program-pagination" aria-label="Registry pages"><Button variant="secondary" size="sm" disabled={page <= 0 || loading} onClick={() => onPage(Math.max(0, page - 1))}>Previous</Button><span>Page {totalPages === 0 ? 0 : page + 1} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => onPage(page + 1)}>Next</Button></nav>;
}
