"use client";

import { FormEvent, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";

export type Scheme = {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  description: string | null;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Enrollment = {
  id: string;
  institutionId: string;
  institutionCode: string;
  institutionName: string;
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  enrollmentCode: string | null;
  status: string;
  enrolledOn: string;
  endedOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  enrollmentId: string;
  institutionId: string;
  institutionCode: string;
  institutionName: string;
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  plannedStartOn: string | null;
  plannedEndOn: string | null;
  actualStartOn: string | null;
  actualEndOn: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Milestone = {
  id: string;
  projectId: string;
  sequenceNo: number;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InstitutionOption = { id: string; code: string; displayName: string };

export type SchemePayload = {
  code: string;
  name: string;
  shortName: string | null;
  description: string | null;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type EnrollmentCreatePayload = {
  institutionId: string;
  schemeId: string;
  enrollmentCode: string | null;
  status: string;
  enrolledOn: string;
  endedOn: string | null;
};

export type EnrollmentUpdatePayload = Omit<EnrollmentCreatePayload, "institutionId" | "schemeId">;

export type ProjectCreatePayload = {
  enrollmentId: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  plannedStartOn: string | null;
  plannedEndOn: string | null;
  actualStartOn: string | null;
  actualEndOn: string | null;
};

export type ProjectUpdatePayload = Omit<ProjectCreatePayload, "enrollmentId">;

export type MilestonePayload = {
  sequenceNo: number;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
};

function emptyToNull(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function SchemeForm({
  value,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  value?: Scheme | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (payload: SchemePayload) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [shortName, setShortName] = useState(value?.shortName ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [status, setStatus] = useState(value?.status ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(value?.effectiveFrom ?? "");
  const [effectiveTo, setEffectiveTo] = useState(value?.effectiveTo ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      code,
      name,
      shortName: emptyToNull(shortName),
      description: emptyToNull(description),
      status,
      effectiveFrom: emptyToNull(effectiveFrom),
      effectiveTo: emptyToNull(effectiveTo),
    });
  }

  return (
    <form className="nx-institution-form" onSubmit={submit}>
      <div className="nx-form-grid">
        <Field label="Scheme code" htmlFor="scheme-code" hint="Use the authoritative normalized code. NirikshanX does not assume one scheme.">
          <Input id="scheme-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Scheme name" htmlFor="scheme-name">
          <Input id="scheme-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={240} required />
        </Field>
        <Field label="Short name" htmlFor="scheme-short-name">
          <Input id="scheme-short-name" value={shortName} onChange={(event) => setShortName(event.target.value)} maxLength={120} />
        </Field>
        <Field label="Status code" htmlFor="scheme-status" hint="Free normalized policy code; no guessed status catalog is hardcoded.">
          <Input id="scheme-status" value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Effective from" htmlFor="scheme-from">
          <Input id="scheme-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
        </Field>
        <Field label="Effective to" htmlFor="scheme-to">
          <Input id="scheme-to" type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="scheme-description">
        <Textarea id="scheme-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
      </Field>
      <div className="nx-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}

export function EnrollmentForm({
  value,
  institutions,
  schemes,
  busy,
  onSubmit,
  onCancel,
}: {
  value?: Enrollment | null;
  institutions: InstitutionOption[];
  schemes: Scheme[];
  busy: boolean;
  onSubmit: (payload: EnrollmentCreatePayload | EnrollmentUpdatePayload) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [institutionId, setInstitutionId] = useState(value?.institutionId ?? institutions[0]?.id ?? "");
  const [schemeId, setSchemeId] = useState(value?.schemeId ?? schemes[0]?.id ?? "");
  const [enrollmentCode, setEnrollmentCode] = useState(value?.enrollmentCode ?? "");
  const [status, setStatus] = useState(value?.status ?? "");
  const [enrolledOn, setEnrolledOn] = useState(value?.enrolledOn ?? "");
  const [endedOn, setEndedOn] = useState(value?.endedOn ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const common = {
      enrollmentCode: emptyToNull(enrollmentCode),
      status,
      enrolledOn,
      endedOn: emptyToNull(endedOn),
    };
    await onSubmit(value ? common : { ...common, institutionId, schemeId });
  }

  return (
    <form className="nx-institution-form" onSubmit={submit}>
      {!value ? (
        <div className="nx-form-grid">
          <Field label="Institution" htmlFor="enrollment-institution">
            <Select id="enrollment-institution" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} required>
              <option value="" disabled>Select an authorized institution</option>
              {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.displayName} · {institution.code}</option>)}
            </Select>
          </Field>
          <Field label="Scheme" htmlFor="enrollment-scheme">
            <Select id="enrollment-scheme" value={schemeId} onChange={(event) => setSchemeId(event.target.value)} required>
              <option value="" disabled>Select a scheme</option>
              {schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name} · {scheme.code}</option>)}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="nx-program-parent-summary">
          <strong>{value.institutionName}</strong>
          <span>{value.schemeName} · parent relationship cannot be reassigned by this editor.</span>
        </div>
      )}
      <div className="nx-form-grid">
        <Field label="Enrollment code" htmlFor="enrollment-code">
          <Input id="enrollment-code" value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value.toUpperCase())} maxLength={96} />
        </Field>
        <Field label="Status code" htmlFor="enrollment-status" hint="Use the applicable authoritative status code.">
          <Input id="enrollment-status" value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Enrolled on" htmlFor="enrolled-on">
          <Input id="enrolled-on" type="date" value={enrolledOn} onChange={(event) => setEnrolledOn(event.target.value)} required />
        </Field>
        <Field label="Ended on" htmlFor="ended-on" hint="Leave empty while the enrollment remains active.">
          <Input id="ended-on" type="date" value={endedOn} onChange={(event) => setEndedOn(event.target.value)} />
        </Field>
      </div>
      <div className="nx-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || (!value && (!institutionId || !schemeId))}>{busy ? "Saving…" : value ? "Save enrollment" : "Create enrollment"}</Button>
      </div>
    </form>
  );
}

export function ProjectForm({
  value,
  enrollments,
  busy,
  onSubmit,
  onCancel,
}: {
  value?: Project | null;
  enrollments: Enrollment[];
  busy: boolean;
  onSubmit: (payload: ProjectCreatePayload | ProjectUpdatePayload) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [enrollmentId, setEnrollmentId] = useState(value?.enrollmentId ?? enrollments[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [title, setTitle] = useState(value?.title ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [status, setStatus] = useState(value?.status ?? "");
  const [plannedStartOn, setPlannedStartOn] = useState(value?.plannedStartOn ?? "");
  const [plannedEndOn, setPlannedEndOn] = useState(value?.plannedEndOn ?? "");
  const [actualStartOn, setActualStartOn] = useState(value?.actualStartOn ?? "");
  const [actualEndOn, setActualEndOn] = useState(value?.actualEndOn ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const common = {
      code,
      title,
      description: emptyToNull(description),
      status,
      plannedStartOn: emptyToNull(plannedStartOn),
      plannedEndOn: emptyToNull(plannedEndOn),
      actualStartOn: emptyToNull(actualStartOn),
      actualEndOn: emptyToNull(actualEndOn),
    };
    await onSubmit(value ? common : { ...common, enrollmentId });
  }

  return (
    <form className="nx-institution-form" onSubmit={submit}>
      {!value ? (
        <Field label="Scheme enrollment" htmlFor="project-enrollment" hint="The enrollment canonically determines both institution and scheme.">
          <Select id="project-enrollment" value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)} required>
            <option value="" disabled>Select an active enrollment</option>
            {enrollments.filter((enrollment) => !enrollment.endedOn).map((enrollment) => (
              <option key={enrollment.id} value={enrollment.id}>{enrollment.institutionName} · {enrollment.schemeName}</option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="nx-program-parent-summary">
          <strong>{value.institutionName}</strong>
          <span>{value.schemeName} · parent enrollment is immutable in this editor.</span>
        </div>
      )}
      <div className="nx-form-grid">
        <Field label="Project code" htmlFor="project-code">
          <Input id="project-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Project title" htmlFor="project-title">
          <Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required />
        </Field>
        <Field label="Status code" htmlFor="project-status">
          <Input id="project-status" value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Planned start" htmlFor="project-planned-start">
          <Input id="project-planned-start" type="date" value={plannedStartOn} onChange={(event) => setPlannedStartOn(event.target.value)} />
        </Field>
        <Field label="Planned end" htmlFor="project-planned-end">
          <Input id="project-planned-end" type="date" value={plannedEndOn} onChange={(event) => setPlannedEndOn(event.target.value)} />
        </Field>
        <Field label="Actual start" htmlFor="project-actual-start">
          <Input id="project-actual-start" type="date" value={actualStartOn} onChange={(event) => setActualStartOn(event.target.value)} />
        </Field>
        <Field label="Actual end" htmlFor="project-actual-end">
          <Input id="project-actual-end" type="date" value={actualEndOn} onChange={(event) => setActualEndOn(event.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="project-description">
        <Textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
      </Field>
      <div className="nx-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || (!value && !enrollmentId)}>{busy ? "Saving…" : value ? "Save project" : "Create project"}</Button>
      </div>
    </form>
  );
}

export function MilestoneForm({
  value,
  busy,
  onSubmit,
  onCancel,
}: {
  value?: Milestone | null;
  busy: boolean;
  onSubmit: (payload: MilestonePayload) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [sequenceNo, setSequenceNo] = useState(String(value?.sequenceNo ?? 1));
  const [code, setCode] = useState(value?.code ?? "");
  const [title, setTitle] = useState(value?.title ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [status, setStatus] = useState(value?.status ?? "");
  const [dueOn, setDueOn] = useState(value?.dueOn ?? "");
  const [completedAt, setCompletedAt] = useState(value?.completedAt ? value.completedAt.slice(0, 16) : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      sequenceNo: Number(sequenceNo),
      code: emptyToNull(code),
      title,
      description: emptyToNull(description),
      status,
      dueOn: emptyToNull(dueOn),
      completedAt: completedAt ? new Date(completedAt).toISOString() : null,
    });
  }

  return (
    <form className="nx-institution-form" onSubmit={submit}>
      <div className="nx-form-grid">
        <Field label="Sequence" htmlFor="milestone-sequence">
          <Input id="milestone-sequence" type="number" min={1} step={1} value={sequenceNo} onChange={(event) => setSequenceNo(event.target.value)} required />
        </Field>
        <Field label="Milestone code" htmlFor="milestone-code">
          <Input id="milestone-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={64} />
        </Field>
        <Field label="Title" htmlFor="milestone-title">
          <Input id="milestone-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required />
        </Field>
        <Field label="Status code" htmlFor="milestone-status">
          <Input id="milestone-status" value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Due on" htmlFor="milestone-due">
          <Input id="milestone-due" type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
        </Field>
        <Field label="Completed at" htmlFor="milestone-completed">
          <Input id="milestone-completed" type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="milestone-description">
        <Textarea id="milestone-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} />
      </Field>
      <div className="nx-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : value ? "Save milestone" : "Create milestone"}</Button>
      </div>
    </form>
  );
}
