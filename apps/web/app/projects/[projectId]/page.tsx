"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  MilestoneForm,
  ProjectForm,
  type Enrollment,
  type Milestone,
  type MilestonePayload,
  type Project,
  type ProjectUpdatePayload,
} from "@/components/program-forms";
import { Button, Card, InlineNotice, StatusBadge } from "@/components/ui/primitives";

type AuthorizationView = { effectivePermissions: string[] };
type ProjectDetail = { project: Project; milestones: Milestone[] };

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

function dateTime(value: string | null) {
  if (!value) return "Not supplied";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { status, request } = useAuth();
  const [authorization, setAuthorization] = useState<AuthorizationView | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectEditor, setProjectEditor] = useState(false);
  const [milestoneEditor, setMilestoneEditor] = useState<"create" | "edit" | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  const permissions = useMemo(() => new Set(authorization?.effectivePermissions ?? []), [authorization]);
  const canProjectUpdate = permissions.has("project.update");
  const canMilestoneRead = permissions.has("milestone.read");
  const canMilestoneCreate = permissions.has("milestone.create");
  const canMilestoneUpdate = permissions.has("milestone.update");

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [router, status]);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const [authResponse, projectResponse] = await Promise.all([
        request("/api/v1/authz/me"),
        request(`/api/v1/projects/${projectId}`),
      ]);
      if (!authResponse.ok) throw new Error(await responseMessage(authResponse));
      if (!projectResponse.ok) throw new Error(await responseMessage(projectResponse));
      setAuthorization((await authResponse.json()) as AuthorizationView);
      setDetail((await projectResponse.json()) as ProjectDetail);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId, request, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveProject(payload: ProjectUpdatePayload) {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request(`/api/v1/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const project = (await response.json()) as Project;
      setDetail((current) => current ? { ...current, project } : current);
      setProjectEditor(false);
      setNotice("Project record updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Project was not updated");
    } finally {
      setBusy(false);
    }
  }

  async function saveMilestone(payload: MilestonePayload) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const editing = milestoneEditor === "edit" && editingMilestone;
      const response = await request(
        editing ? `/api/v1/projects/${projectId}/milestones/${editingMilestone.id}` : `/api/v1/projects/${projectId}/milestones`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as Milestone;
      setDetail((current) => {
        if (!current) return current;
        const milestones = editing
          ? current.milestones.map((item) => item.id === saved.id ? saved : item).sort((a, b) => a.sequenceNo - b.sequenceNo)
          : [...current.milestones, saved].sort((a, b) => a.sequenceNo - b.sequenceNo);
        return { ...current, milestones };
      });
      setMilestoneEditor(null);
      setEditingMilestone(null);
      setNotice(`${editing ? "Updated" : "Created"} milestone ${saved.sequenceNo}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Milestone was not saved");
    } finally {
      setBusy(false);
    }
  }

  if (loading || status === "loading") {
    return <main className="nx-programs-page"><p className="nx-auth-loading">Loading authorized project…</p></main>;
  }

  if (!detail) {
    return (
      <main className="nx-programs-page" id="main-content">
        <ProjectHeader />
        <div className="nx-program-width nx-program-state"><InlineNotice tone="danger" title="Project unavailable">{error ?? "This project is not available in your authorized scope."}</InlineNotice></div>
      </main>
    );
  }

  const project = detail.project;

  return (
    <main className="nx-programs-page" id="main-content">
      <ProjectHeader />

      <section className="nx-program-width nx-program-detail-hero">
        <div>
          <Link className="nx-back-link" href="/programs">← Programs & projects</Link>
          <h1>{project.title}</h1>
          <p>{project.institutionName} · {project.schemeName}</p>
        </div>
        <div className="nx-program-detail-actions">
          <StatusBadge tone={tone(project.status)}>{project.status}</StatusBadge>
          {canProjectUpdate ? <Button onClick={() => setProjectEditor((value) => !value)}>{projectEditor ? "Close editor" : "Edit project"}</Button> : null}
        </div>
      </section>

      {notice ? <div className="nx-program-width nx-program-state"><InlineNotice tone="success" title="Saved">{notice}</InlineNotice></div> : null}
      {error ? <div className="nx-program-width nx-program-state"><InlineNotice tone="danger" title="Request failed">{error}</InlineNotice></div> : null}

      {projectEditor && canProjectUpdate ? (
        <Card className="nx-program-width nx-program-editor" as="section">
          <ProjectSectionHeading title="Edit project" copy="Only project-owned fields are mutable. The canonical parent enrollment, institution and scheme cannot be silently reassigned." />
          <ProjectForm value={project} enrollments={[] as Enrollment[]} busy={busy} onSubmit={(payload) => saveProject(payload as ProjectUpdatePayload)} onCancel={() => setProjectEditor(false)} />
        </Card>
      ) : null}

      <div className="nx-program-width nx-program-detail-grid">
        <Card className="nx-program-detail-card" as="section">
          <ProjectSectionHeading title="Overview" copy="Persisted project data resolved through its scheme enrollment." />
          <dl className="nx-program-detail-list">
            <Detail label="Project code" value={project.code} />
            <Detail label="Institution" value={`${project.institutionName} · ${project.institutionCode}`} />
            <Detail label="Scheme" value={`${project.schemeName} · ${project.schemeCode}`} />
            <Detail label="Description" value={project.description ?? "Not supplied"} />
            <Detail label="Project ID" value={project.id} mono />
          </dl>
        </Card>

        <Card className="nx-program-detail-card" as="section">
          <ProjectSectionHeading title="Schedule" copy="Planned and actual dates are recorded independently without inventing lifecycle policy." />
          <dl className="nx-program-detail-list">
            <Detail label="Planned start" value={project.plannedStartOn ?? "Not supplied"} />
            <Detail label="Planned end" value={project.plannedEndOn ?? "Not supplied"} />
            <Detail label="Actual start" value={project.actualStartOn ?? "Not supplied"} />
            <Detail label="Actual end" value={project.actualEndOn ?? "Not supplied"} />
            <Detail label="Updated" value={dateTime(project.updatedAt)} />
          </dl>
        </Card>
      </div>

      {canMilestoneRead ? (
        <Card className="nx-program-width nx-program-milestones" as="section">
          <ProjectSectionHeading
            title="Milestones"
            copy="Ordered milestones belong to this project only. Duplicate sequence numbers are rejected by PostgreSQL."
            action={canMilestoneCreate ? <Button onClick={() => { setEditingMilestone(null); setMilestoneEditor("create"); }}>Create milestone</Button> : null}
          />

          {milestoneEditor && (canMilestoneCreate || (milestoneEditor === "edit" && canMilestoneUpdate)) ? (
            <div className="nx-program-inline-editor">
              <MilestoneForm value={editingMilestone} busy={busy} onSubmit={saveMilestone} onCancel={() => { setMilestoneEditor(null); setEditingMilestone(null); }} />
            </div>
          ) : null}

          {detail.milestones.length === 0 ? (
            <div className="nx-program-empty-inline"><strong>No milestones recorded</strong><p>No fake milestones are generated for this project.</p></div>
          ) : (
            <ol className="nx-milestone-list">
              {detail.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <div className="nx-milestone-sequence" aria-label={`Milestone ${milestone.sequenceNo}`}>{milestone.sequenceNo}</div>
                  <div className="nx-milestone-copy">
                    <div><strong>{milestone.title}</strong><span>{milestone.code ?? "No code"}</span></div>
                    <p>{milestone.description ?? "No description supplied."}</p>
                    <small>Due {milestone.dueOn ?? "not set"}{milestone.completedAt ? ` · completed ${dateTime(milestone.completedAt)}` : ""}</small>
                  </div>
                  <div className="nx-milestone-actions">
                    <StatusBadge tone={tone(milestone.status)}>{milestone.status}</StatusBadge>
                    {canMilestoneUpdate ? <Button variant="ghost" size="sm" onClick={() => { setEditingMilestone(milestone); setMilestoneEditor("edit"); }}>Edit</Button> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ) : null}
    </main>
  );
}

function ProjectHeader() {
  return (
    <header className="nx-program-width nx-program-header">
      <Link className="nx-auth-brand" href="/programs"><span className="nx-brand-mark" aria-hidden="true">NX</span><span><strong>NirikshanX</strong><small>Project overview</small></span></Link>
      <nav aria-label="Project navigation"><Link href="/programs">Programs</Link><Link href="/institutions">Institutions</Link><Link href="/account">Account & security</Link></nav>
    </header>
  );
}

function ProjectSectionHeading({ title, copy, action }: { title: string; copy: string; action?: React.ReactNode }) {
  return <div className="nx-program-section-heading"><div><h2>{title}</h2><p>{copy}</p></div>{action ? <div>{action}</div> : null}</div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "nx-mono" : undefined}>{value}</dd></div>;
}
