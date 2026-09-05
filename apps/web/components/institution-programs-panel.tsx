"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Enrollment, Project } from "@/components/program-forms";
import { Card, InlineNotice, StatusBadge } from "@/components/ui/primitives";

type PageView<T> = { items: T[]; total: number; page: number; size: number; totalPages: number };

type Props = {
  institutionId: string;
  effectivePermissions: string[];
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
  if (normalized.includes("ACTIVE") || normalized.includes("COMPLETE") || normalized.includes("APPROVED")) return "success" as const;
  if (normalized.includes("PENDING") || normalized.includes("PLANNED") || normalized.includes("REVIEW")) return "warning" as const;
  if (normalized.includes("SUSPEND") || normalized.includes("CANCEL") || normalized.includes("REJECT")) return "danger" as const;
  return "neutral" as const;
}

export function InstitutionProgramsPanel({ institutionId, effectivePermissions }: Props) {
  const { request } = useAuth();
  const permissions = useMemo(() => new Set(effectivePermissions), [effectivePermissions]);
  const canReadEnrollments = permissions.has("enrollment.read");
  const canReadProjects = permissions.has("project.read");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canReadEnrollments && !canReadProjects) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<void>[] = [];
      if (canReadEnrollments) {
        tasks.push(request(`/api/v1/institutions/${institutionId}/scheme-enrollments?page=0&size=20`).then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          const body = (await response.json()) as PageView<Enrollment>;
          setEnrollments(body.items);
        }));
      }
      if (canReadProjects) {
        tasks.push(request(`/api/v1/projects?institutionId=${encodeURIComponent(institutionId)}&page=0&size=20&sort=title&direction=asc`).then(async (response) => {
          if (!response.ok) throw new Error(await responseMessage(response));
          const body = (await response.json()) as PageView<Project>;
          setProjects(body.items);
        }));
      }
      await Promise.all(tasks);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load institution programs");
    } finally {
      setLoading(false);
    }
  }, [canReadEnrollments, canReadProjects, institutionId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!canReadEnrollments && !canReadProjects) return null;

  return (
    <Card className="nx-institution-width nx-institution-programs" as="section">
      <div className="nx-institution-section-heading">
        <div>
          <h2>Schemes & projects</h2>
          <p>Only real program records in this institution&apos;s authorized scope are shown. No future Institution 360 modules are simulated.</p>
        </div>
        <Link className="nx-row-link" href="/programs">Open program registry</Link>
      </div>

      {error ? <InlineNotice tone="danger" title="Program records unavailable">{error}</InlineNotice> : null}
      {loading ? <p className="nx-muted-copy">Loading authorized scheme and project records…</p> : null}

      {!loading && !error ? (
        <div className="nx-institution-program-grid">
          {canReadEnrollments ? (
            <div>
              <div className="nx-institution-program-subhead"><strong>Scheme enrollments</strong><span>{enrollments.length}</span></div>
              {enrollments.length === 0 ? <p className="nx-muted-copy">No scheme enrollments are recorded for this institution.</p> : (
                <div className="nx-institution-program-list">
                  {enrollments.map((enrollment) => (
                    <article key={enrollment.id}>
                      <div><strong>{enrollment.schemeName}</strong><span>{enrollment.enrollmentCode ?? enrollment.schemeCode}</span></div>
                      <StatusBadge tone={tone(enrollment.status)}>{enrollment.status}</StatusBadge>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {canReadProjects ? (
            <div>
              <div className="nx-institution-program-subhead"><strong>Projects</strong><span>{projects.length}</span></div>
              {projects.length === 0 ? <p className="nx-muted-copy">No projects are recorded in this institution&apos;s authorized scope.</p> : (
                <div className="nx-institution-program-list">
                  {projects.map((project) => (
                    <article key={project.id}>
                      <div><Link href={`/projects/${project.id}`}>{project.title}</Link><span>{project.code} · {project.schemeName}</span></div>
                      <StatusBadge tone={tone(project.status)}>{project.status}</StatusBadge>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
