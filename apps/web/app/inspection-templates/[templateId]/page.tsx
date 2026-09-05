"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Button,
  Card,
  Checkbox,
  Field,
  InlineNotice,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/primitives";

const QUESTION_TYPES = [
  "YES_NO",
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DATE",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "PHOTO",
  "VIDEO",
  "DOCUMENT",
  "LOCATION_CONFIRMATION",
] as const;

const EVIDENCE_TYPES = ["PHOTO", "VIDEO", "DOCUMENT", "LOCATION_CONFIRMATION"] as const;
const EMPTY_OPERATORS = ["IS_EMPTY", "IS_NOT_EMPTY"] as const;
const EQUALITY_OPERATORS = ["EQUALS", "NOT_EQUALS"] as const;
const TEXT_OPERATORS = ["CONTAINS", "NOT_CONTAINS"] as const;
const ORDER_OPERATORS = ["GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"] as const;

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

type VersionSummary = {
  id: string;
  versionNo: number;
  status: "DRAFT" | "PUBLISHED";
  changeSummary: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplateDetail = {
  template: TemplateSummary;
  versions: VersionSummary[];
  canAuthor: boolean;
};

type OptionInput = { clientId: string; value: string; label: string; sequenceNo: number };
type QuestionInput = {
  clientId: string;
  code: string;
  prompt: string;
  helpText: string;
  questionType: string;
  required: boolean;
  sequenceNo: number;
  options: OptionInput[];
};
type SectionInput = {
  clientId: string;
  code: string;
  title: string;
  description: string;
  sequenceNo: number;
  questions: QuestionInput[];
};
type ConditionInput = {
  clientId: string;
  code: string;
  sourceQuestionCode: string;
  operator: string;
  comparisonValue: string;
  targetQuestionCode: string;
  showTarget: boolean;
  requireTargetAnswer: boolean;
  suggestFinding: boolean;
  sequenceNo: number;
};
type EvidenceInput = {
  clientId: string;
  questionCode: string;
  conditionCode: string;
  evidenceType: string;
  minCount: number;
  instructions: string;
  sequenceNo: number;
};
type DraftGraph = { sections: SectionInput[]; conditions: ConditionInput[]; evidenceRequirements: EvidenceInput[] };

type VersionGraph = {
  version: VersionSummary;
  sections: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    sequenceNo: number;
    questions: Array<{
      id: string;
      code: string;
      prompt: string;
      helpText: string | null;
      questionType: string;
      required: boolean;
      sequenceNo: number;
      options: Array<{ id: string; value: string; label: string; sequenceNo: number }>;
    }>;
  }>;
  conditions: Array<{
    id: string;
    code: string;
    sourceQuestionCode: string;
    operator: string;
    comparisonValue: string | null;
    targetQuestionCode: string | null;
    showTarget: boolean;
    requireTargetAnswer: boolean;
    suggestFinding: boolean;
    sequenceNo: number;
  }>;
  evidenceRequirements: Array<{
    id: string;
    questionCode: string;
    conditionCode: string | null;
    evidenceType: string;
    minCount: number;
    instructions: string | null;
    sequenceNo: number;
  }>;
};

function clientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function graphToDraft(graph: VersionGraph): DraftGraph {
  return {
    sections: graph.sections.map((section) => ({
      clientId: section.id,
      code: section.code,
      title: section.title,
      description: section.description ?? "",
      sequenceNo: section.sequenceNo,
      questions: section.questions.map((question) => ({
        clientId: question.id,
        code: question.code,
        prompt: question.prompt,
        helpText: question.helpText ?? "",
        questionType: question.questionType,
        required: question.required,
        sequenceNo: question.sequenceNo,
        options: question.options.map((option) => ({ ...option, clientId: option.id })),
      })),
    })),
    conditions: graph.conditions.map((condition) => ({
      clientId: condition.id,
      code: condition.code,
      sourceQuestionCode: condition.sourceQuestionCode,
      operator: condition.operator,
      comparisonValue: condition.comparisonValue ?? "",
      targetQuestionCode: condition.targetQuestionCode ?? "",
      showTarget: condition.showTarget,
      requireTargetAnswer: condition.requireTargetAnswer,
      suggestFinding: condition.suggestFinding,
      sequenceNo: condition.sequenceNo,
    })),
    evidenceRequirements: graph.evidenceRequirements.map((evidence) => ({
      clientId: evidence.id,
      questionCode: evidence.questionCode,
      conditionCode: evidence.conditionCode ?? "",
      evidenceType: evidence.evidenceType,
      minCount: evidence.minCount,
      instructions: evidence.instructions ?? "",
      sequenceNo: evidence.sequenceNo,
    })),
  };
}

function payload(graph: DraftGraph) {
  return {
    sections: graph.sections.map(({ clientId: _sectionId, ...section }) => ({
      ...section,
      description: section.description.trim() || null,
      questions: section.questions.map(({ clientId: _questionId, ...question }) => ({
        ...question,
        helpText: question.helpText.trim() || null,
        options: question.options.map(({ clientId: _optionId, ...option }) => option),
      })),
    })),
    conditions: graph.conditions.map(({ clientId: _conditionId, ...condition }) => ({
      ...condition,
      comparisonValue: condition.comparisonValue.trim() || null,
      targetQuestionCode: condition.targetQuestionCode.trim() || null,
    })),
    evidenceRequirements: graph.evidenceRequirements.map(({ clientId: _evidenceId, ...evidence }) => ({
      ...evidence,
      conditionCode: evidence.conditionCode.trim() || null,
      instructions: evidence.instructions.trim() || null,
    })),
  };
}

function operatorsFor(type: string) {
  if (["PHOTO", "VIDEO", "DOCUMENT", "LOCATION_CONFIRMATION"].includes(type)) return [...EMPTY_OPERATORS];
  if (type === "YES_NO" || type === "SINGLE_SELECT") return [...EQUALITY_OPERATORS, ...EMPTY_OPERATORS];
  if (type === "TEXT" || type === "LONG_TEXT") return [...EQUALITY_OPERATORS, ...TEXT_OPERATORS, ...EMPTY_OPERATORS];
  if (type === "NUMBER" || type === "DATE") return [...EQUALITY_OPERATORS, ...ORDER_OPERATORS, ...EMPTY_OPERATORS];
  if (type === "MULTI_SELECT") return [...TEXT_OPERATORS, ...EMPTY_OPERATORS];
  return [...EMPTY_OPERATORS];
}

function human(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function InspectionTemplateDetailPage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params.templateId;
  const { request } = useAuth();
  const { authorization, privilegeRestricted } = useWorkspace();
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionGraph | null>(null);
  const [draft, setDraft] = useState<DraftGraph>({ sections: [], conditions: [], evidenceRequirements: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState("");

  const permissions = useMemo(() => new Set(authorization?.effectivePermissions ?? []), [authorization]);
  const canRead = permissions.has("inspection.read");
  const canAuthor = permissions.has("inspection.create") && (detail?.canAuthor ?? false);
  const selectedSummary = detail?.versions.find((item) => item.id === selectedVersionId) ?? null;
  const editable = canAuthor && selectedSummary?.status === "DRAFT";

  const questions = useMemo(() => draft.sections.flatMap((section) => section.questions), [draft.sections]);
  const questionMap = useMemo(() => new Map(questions.map((question) => [question.code, question])), [questions]);

  const loadDetail = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const response = await request(`/api/v1/inspection-templates/${templateId}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as TemplateDetail;
      setDetail(body);
      setSelectedVersionId((current) => {
        if (current && body.versions.some((item) => item.id === current)) return current;
        return body.versions.find((item) => item.status === "DRAFT")?.id ?? body.versions[0]?.id ?? null;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load inspection template");
    } finally {
      setLoading(false);
    }
  }, [canRead, request, templateId]);

  const loadVersion = useCallback(async (versionId: string) => {
    setError(null);
    try {
      const response = await request(`/api/v1/inspection-templates/${templateId}/versions/${versionId}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = (await response.json()) as VersionGraph;
      setVersion(body);
      setDraft(graphToDraft(body));
    } catch (reason) {
      setVersion(null);
      setError(reason instanceof Error ? reason.message : "Unable to load template version");
    }
  }, [request, templateId]);

  useEffect(() => {
    if (!authorization || !canRead) return;
    const timer = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timer);
  }, [authorization, canRead, loadDetail]);

  useEffect(() => {
    if (!selectedVersionId) {
      setVersion(null);
      setDraft({ sections: [], conditions: [], evidenceRequirements: [] });
      return;
    }
    const timer = window.setTimeout(() => void loadVersion(selectedVersionId), 0);
    return () => window.clearTimeout(timer);
  }, [loadVersion, selectedVersionId]);

  function updateSection(sectionId: string, patch: Partial<SectionInput>) {
    setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.clientId === sectionId ? { ...section, ...patch } : section) }));
  }

  function updateQuestion(sectionId: string, questionId: string, patch: Partial<QuestionInput>) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.clientId !== sectionId ? section : {
        ...section,
        questions: section.questions.map((question) => question.clientId === questionId ? { ...question, ...patch } : question),
      }),
    }));
  }

  function addSection() {
    setDraft((current) => ({
      ...current,
      sections: [...current.sections, {
        clientId: clientId(), code: `SECTION_${current.sections.length + 1}`, title: "New section", description: "",
        sequenceNo: current.sections.length + 1, questions: [],
      }],
    }));
  }

  function removeSection(sectionId: string) {
    const removedCodes = new Set(draft.sections.find((section) => section.clientId === sectionId)?.questions.map((question) => question.code) ?? []);
    setDraft((current) => ({
      sections: current.sections.filter((section) => section.clientId !== sectionId),
      conditions: current.conditions.filter((condition) => !removedCodes.has(condition.sourceQuestionCode) && !removedCodes.has(condition.targetQuestionCode)),
      evidenceRequirements: current.evidenceRequirements.filter((evidence) => !removedCodes.has(evidence.questionCode)),
    }));
  }

  function addQuestion(sectionId: string) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.clientId !== sectionId ? section : {
        ...section,
        questions: [...section.questions, {
          clientId: clientId(), code: `QUESTION_${questions.length + 1}`, prompt: "New inspection question", helpText: "",
          questionType: "YES_NO", required: false, sequenceNo: section.questions.length + 1, options: [],
        }],
      }),
    }));
  }

  function removeQuestion(sectionId: string, questionId: string, code: string) {
    setDraft((current) => ({
      sections: current.sections.map((section) => section.clientId !== sectionId ? section : {
        ...section, questions: section.questions.filter((question) => question.clientId !== questionId),
      }),
      conditions: current.conditions.filter((condition) => condition.sourceQuestionCode !== code && condition.targetQuestionCode !== code),
      evidenceRequirements: current.evidenceRequirements.filter((evidence) => evidence.questionCode !== code),
    }));
  }

  function addOption(sectionId: string, questionId: string) {
    const question = draft.sections.flatMap((section) => section.questions).find((item) => item.clientId === questionId);
    const count = question?.options.length ?? 0;
    updateQuestion(sectionId, questionId, {
      options: [...(question?.options ?? []), { clientId: clientId(), value: `OPTION_${count + 1}`, label: `Option ${count + 1}`, sequenceNo: count + 1 }],
    });
  }

  function updateOption(sectionId: string, questionId: string, optionId: string, patch: Partial<OptionInput>) {
    const question = draft.sections.flatMap((section) => section.questions).find((item) => item.clientId === questionId);
    updateQuestion(sectionId, questionId, {
      options: (question?.options ?? []).map((option) => option.clientId === optionId ? { ...option, ...patch } : option),
    });
  }

  function removeOption(sectionId: string, questionId: string, optionId: string) {
    const question = draft.sections.flatMap((section) => section.questions).find((item) => item.clientId === questionId);
    updateQuestion(sectionId, questionId, { options: (question?.options ?? []).filter((option) => option.clientId !== optionId) });
  }

  function addCondition() {
    const source = questions[0]?.code ?? "";
    const sourceType = questions[0]?.questionType ?? "YES_NO";
    setDraft((current) => ({
      ...current,
      conditions: [...current.conditions, {
        clientId: clientId(), code: `CONDITION_${current.conditions.length + 1}`, sourceQuestionCode: source,
        operator: operatorsFor(sourceType)[0], comparisonValue: sourceType === "YES_NO" ? "NO" : "",
        targetQuestionCode: "", showTarget: false, requireTargetAnswer: false, suggestFinding: true,
        sequenceNo: current.conditions.filter((item) => item.sourceQuestionCode === source).length + 1,
      }],
    }));
  }

  function updateCondition(id: string, patch: Partial<ConditionInput>) {
    setDraft((current) => ({ ...current, conditions: current.conditions.map((item) => item.clientId === id ? { ...item, ...patch } : item) }));
  }

  function addEvidence() {
    setDraft((current) => ({
      ...current,
      evidenceRequirements: [...current.evidenceRequirements, {
        clientId: clientId(), questionCode: questions[0]?.code ?? "", conditionCode: "", evidenceType: "PHOTO",
        minCount: 1, instructions: "", sequenceNo: current.evidenceRequirements.filter((item) => item.questionCode === (questions[0]?.code ?? "")).length + 1,
      }],
    }));
  }

  function updateEvidence(id: string, patch: Partial<EvidenceInput>) {
    setDraft((current) => ({ ...current, evidenceRequirements: current.evidenceRequirements.map((item) => item.clientId === id ? { ...item, ...patch } : item) }));
  }

  async function saveDraft() {
    if (!selectedVersionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request(`/api/v1/inspection-templates/${templateId}/versions/${selectedVersionId}/draft`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(draft)),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const saved = (await response.json()) as VersionGraph;
      setVersion(saved);
      setDraft(graphToDraft(saved));
      setNotice(`Draft version ${saved.version.versionNo} saved.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Draft was not saved");
    } finally {
      setBusy(false);
    }
  }

  async function publishVersion() {
    if (!selectedVersionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saveResponse = await request(`/api/v1/inspection-templates/${templateId}/versions/${selectedVersionId}/draft`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(draft)),
      });
      if (!saveResponse.ok) throw new Error(await responseMessage(saveResponse));
      const response = await request(`/api/v1/inspection-templates/${templateId}/versions/${selectedVersionId}/publish`, { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response));
      const published = (await response.json()) as VersionGraph;
      setVersion(published);
      setDraft(graphToDraft(published));
      setNotice(`Version ${published.version.versionNo} published and is now immutable.`);
      await loadDetail();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Version was not published");
    } finally {
      setBusy(false);
    }
  }

  async function createNewVersion() {
    if (!selectedVersionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request(`/api/v1/inspection-templates/${templateId}/versions/${selectedVersionId}/new-version`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary: changeSummary.trim() || null }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const created = (await response.json()) as VersionGraph;
      setVersion(created);
      setDraft(graphToDraft(created));
      setSelectedVersionId(created.version.id);
      setChangeSummary("");
      setNotice(`Draft version ${created.version.versionNo} created from the published snapshot.`);
      await loadDetail();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "New version was not created");
    } finally {
      setBusy(false);
    }
  }

  if (!authorization || loading) {
    return <main className="nx-template-page" id="main-content"><p className="nx-auth-loading">Loading template builder…</p></main>;
  }

  if (!canRead) {
    return <main className="nx-template-page" id="main-content"><InlineNotice tone="danger" title="Template access is unavailable">Your current effective permissions do not include inspection.read.</InlineNotice></main>;
  }

  if (!detail) {
    return <main className="nx-template-page" id="main-content"><InlineNotice tone="danger" title="Template unavailable">{error || "The inspection template could not be loaded."}</InlineNotice></main>;
  }

  return (
    <main className="nx-template-page nx-template-detail" id="main-content">
      <div className="nx-template-back"><Link href="/inspection-templates">← All templates</Link></div>
      <section className="nx-template-detail-hero">
        <div>
          <span className="nx-template-code">{detail.template.code}</span>
          <h1>{detail.template.name}</h1>
          <p>{detail.template.description || "Reusable, versioned inspection questionnaire."}</p>
        </div>
        {selectedSummary ? <StatusBadge tone={selectedSummary.status === "PUBLISHED" ? "success" : "warning"}>{selectedSummary.status} · v{selectedSummary.versionNo}</StatusBadge> : null}
      </section>

      {privilegeRestricted && authorization.withheldPermissions.includes("inspection.create") ? (
        <InlineNotice tone="warning" title="Read-only until MFA is satisfied">Your current session can inspect published versions, but template authoring is withheld.</InlineNotice>
      ) : null}
      {notice ? <InlineNotice tone="success" title="Template updated">{notice}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger" title="Template action failed">{error}</InlineNotice> : null}

      <div className="nx-template-builder-layout">
        <aside className="nx-template-version-panel">
          <Card as="section">
            <div className="nx-template-section-heading"><div><h2>Version history</h2><p>Published snapshots cannot be edited.</p></div></div>
            <div className="nx-template-version-list">
              {detail.versions.map((item) => (
                <button className={item.id === selectedVersionId ? "is-active" : ""} key={item.id} onClick={() => setSelectedVersionId(item.id)}>
                  <span>Version {item.versionNo}</span>
                  <StatusBadge tone={item.status === "PUBLISHED" ? "success" : "warning"}>{item.status}</StatusBadge>
                  <small>{item.changeSummary || (item.versionNo === 1 ? "Initial version" : "No change summary")}</small>
                </button>
              ))}
            </div>
          </Card>

          {canAuthor && selectedSummary?.status === "PUBLISHED" ? (
            <Card as="section" className="nx-template-new-version">
              <h2>Create next version</h2>
              <p>Clone this immutable snapshot into a new editable draft.</p>
              <Field label="Change summary" htmlFor="change-summary">
                <Textarea id="change-summary" rows={3} maxLength={1000} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} />
              </Field>
              <Button onClick={() => void createNewVersion()} disabled={busy}>{busy ? "Creating…" : "Create new draft"}</Button>
            </Card>
          ) : null}
        </aside>

        <div className="nx-template-builder-main">
          {!version ? (
            <Card className="nx-template-empty" as="section"><h2>Select a version</h2><p>Choose a version to inspect its questionnaire graph.</p></Card>
          ) : (
            <>
              <div className="nx-template-builder-toolbar">
                <div>
                  <span className="nx-page-meta">Questionnaire graph</span>
                  <strong>{draft.sections.length} sections · {questions.length} questions · {draft.conditions.length} conditions</strong>
                </div>
                {editable ? (
                  <div>
                    <Button variant="secondary" onClick={() => void saveDraft()} disabled={busy}>{busy ? "Saving…" : "Save draft"}</Button>
                    <Button onClick={() => void publishVersion()} disabled={busy || questions.length === 0}>{busy ? "Working…" : "Publish version"}</Button>
                  </div>
                ) : null}
              </div>

              {draft.sections.length === 0 ? (
                <Card className="nx-template-empty" as="section">
                  <h2>{editable ? "Start with a section" : "This version has no questionnaire content"}</h2>
                  <p>{editable ? "Sections organize typed questions. Nothing is hardcoded into the application." : "Only stored template content is shown."}</p>
                  {editable ? <Button onClick={addSection}>Add first section</Button> : null}
                </Card>
              ) : null}

              <div className="nx-template-section-stack">
                {draft.sections.map((section) => (
                  <Card as="section" className="nx-template-builder-section" key={section.clientId}>
                    <div className="nx-template-builder-section-top">
                      <div className="nx-template-section-index">{section.sequenceNo}</div>
                      <div className="nx-template-section-fields">
                        <Input aria-label="Section code" value={section.code} disabled={!editable} onChange={(event) => updateSection(section.clientId, { code: event.target.value.toUpperCase() })} maxLength={64} />
                        <Input aria-label="Section title" value={section.title} disabled={!editable} onChange={(event) => updateSection(section.clientId, { title: event.target.value })} maxLength={240} />
                      </div>
                      {editable ? <Button variant="ghost" size="sm" onClick={() => removeSection(section.clientId)}>Remove</Button> : null}
                    </div>
                    <Textarea aria-label="Section description" rows={2} value={section.description} disabled={!editable} onChange={(event) => updateSection(section.clientId, { description: event.target.value })} maxLength={1000} placeholder="Optional section guidance" />

                    <div className="nx-template-question-stack">
                      {section.questions.map((question) => {
                        const selectQuestion = question.questionType === "SINGLE_SELECT" || question.questionType === "MULTI_SELECT";
                        return (
                          <article className="nx-template-question" key={question.clientId}>
                            <div className="nx-template-question-head">
                              <span>Q{question.sequenceNo}</span>
                              <div>
                                <Input aria-label="Question code" value={question.code} disabled={!editable} onChange={(event) => updateQuestion(section.clientId, question.clientId, { code: event.target.value.toUpperCase() })} maxLength={64} />
                                <Select aria-label="Question type" value={question.questionType} disabled={!editable} onChange={(event) => {
                                  const questionType = event.target.value;
                                  updateQuestion(section.clientId, question.clientId, { questionType, options: ["SINGLE_SELECT", "MULTI_SELECT"].includes(questionType) ? question.options : [] });
                                }}>
                                  {QUESTION_TYPES.map((type) => <option value={type} key={type}>{human(type)}</option>)}
                                </Select>
                              </div>
                              {editable ? <Button variant="ghost" size="sm" onClick={() => removeQuestion(section.clientId, question.clientId, question.code)}>Remove</Button> : null}
                            </div>
                            <Textarea aria-label="Question prompt" rows={2} value={question.prompt} disabled={!editable} onChange={(event) => updateQuestion(section.clientId, question.clientId, { prompt: event.target.value })} maxLength={1000} />
                            <Input aria-label="Question help text" value={question.helpText} disabled={!editable} onChange={(event) => updateQuestion(section.clientId, question.clientId, { helpText: event.target.value })} maxLength={1000} placeholder="Optional inspector guidance" />
                            <Checkbox id={`required-${question.clientId}`} label="Required answer" checked={question.required} disabled={!editable} onChange={(event) => updateQuestion(section.clientId, question.clientId, { required: event.target.checked })} />

                            {selectQuestion ? (
                              <div className="nx-template-options">
                                <div className="nx-template-mini-heading"><strong>Options</strong>{editable ? <Button variant="ghost" size="sm" onClick={() => addOption(section.clientId, question.clientId)}>Add option</Button> : null}</div>
                                {question.options.map((option) => (
                                  <div className="nx-template-option-row" key={option.clientId}>
                                    <Input aria-label="Option value" value={option.value} disabled={!editable} onChange={(event) => updateOption(section.clientId, question.clientId, option.clientId, { value: event.target.value.toUpperCase() })} maxLength={96} />
                                    <Input aria-label="Option label" value={option.label} disabled={!editable} onChange={(event) => updateOption(section.clientId, question.clientId, option.clientId, { label: event.target.value })} maxLength={240} />
                                    {editable ? <Button variant="ghost" size="sm" onClick={() => removeOption(section.clientId, question.clientId, option.clientId)}>×</Button> : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                    {editable ? <Button variant="secondary" size="sm" onClick={() => addQuestion(section.clientId)}>Add question</Button> : null}
                  </Card>
                ))}
              </div>
              {editable && draft.sections.length > 0 ? <Button variant="secondary" onClick={addSection}>Add section</Button> : null}

              <Card className="nx-template-rules" as="section">
                <div className="nx-template-section-heading">
                  <div><h2>Conditional behavior</h2><p>Rules are stored with the version and revalidated by the backend.</p></div>
                  {editable && questions.length > 0 ? <Button variant="secondary" size="sm" onClick={addCondition}>Add condition</Button> : null}
                </div>
                {draft.conditions.length === 0 ? <p className="nx-template-muted">No conditional behavior configured.</p> : null}
                {draft.conditions.map((condition) => {
                  const source = questionMap.get(condition.sourceQuestionCode);
                  const operators = operatorsFor(source?.questionType ?? "YES_NO");
                  const valueNotUsed = EMPTY_OPERATORS.includes(condition.operator as (typeof EMPTY_OPERATORS)[number]);
                  return (
                    <article className="nx-template-rule" key={condition.clientId}>
                      <div className="nx-template-rule-grid">
                        <Field label="Condition code" htmlFor={`condition-code-${condition.clientId}`}>
                          <Input id={`condition-code-${condition.clientId}`} disabled={!editable} value={condition.code} onChange={(event) => updateCondition(condition.clientId, { code: event.target.value.toUpperCase() })} />
                        </Field>
                        <Field label="When question" htmlFor={`condition-source-${condition.clientId}`}>
                          <Select id={`condition-source-${condition.clientId}`} disabled={!editable} value={condition.sourceQuestionCode} onChange={(event) => {
                            const nextSource = questionMap.get(event.target.value);
                            const nextOperator = operatorsFor(nextSource?.questionType ?? "YES_NO")[0];
                            updateCondition(condition.clientId, { sourceQuestionCode: event.target.value, operator: nextOperator, comparisonValue: nextSource?.questionType === "YES_NO" ? "NO" : "" });
                          }}>
                            {questions.map((question) => <option key={question.clientId} value={question.code}>{question.code} · {question.prompt}</option>)}
                          </Select>
                        </Field>
                        <Field label="Operator" htmlFor={`condition-operator-${condition.clientId}`}>
                          <Select id={`condition-operator-${condition.clientId}`} disabled={!editable} value={condition.operator} onChange={(event) => updateCondition(condition.clientId, { operator: event.target.value, comparisonValue: EMPTY_OPERATORS.includes(event.target.value as (typeof EMPTY_OPERATORS)[number]) ? "" : condition.comparisonValue })}>
                            {operators.map((operator) => <option value={operator} key={operator}>{human(operator)}</option>)}
                          </Select>
                        </Field>
                        <Field label="Comparison" htmlFor={`condition-value-${condition.clientId}`}>
                          {source && ["SINGLE_SELECT", "MULTI_SELECT"].includes(source.questionType) && !valueNotUsed ? (
                            <Select id={`condition-value-${condition.clientId}`} disabled={!editable} value={condition.comparisonValue} onChange={(event) => updateCondition(condition.clientId, { comparisonValue: event.target.value })}>
                              <option value="">Select option</option>
                              {source.options.map((option) => <option key={option.clientId} value={option.value}>{option.label}</option>)}
                            </Select>
                          ) : source?.questionType === "YES_NO" && !valueNotUsed ? (
                            <Select id={`condition-value-${condition.clientId}`} disabled={!editable} value={condition.comparisonValue} onChange={(event) => updateCondition(condition.clientId, { comparisonValue: event.target.value })}><option value="YES">Yes</option><option value="NO">No</option></Select>
                          ) : (
                            <Input id={`condition-value-${condition.clientId}`} disabled={!editable || valueNotUsed} type={source?.questionType === "DATE" ? "date" : source?.questionType === "NUMBER" ? "number" : "text"} value={condition.comparisonValue} onChange={(event) => updateCondition(condition.clientId, { comparisonValue: event.target.value })} />
                          )}
                        </Field>
                        <Field label="Target question" htmlFor={`condition-target-${condition.clientId}`}>
                          <Select id={`condition-target-${condition.clientId}`} disabled={!editable} value={condition.targetQuestionCode} onChange={(event) => updateCondition(condition.clientId, { targetQuestionCode: event.target.value })}>
                            <option value="">No target question</option>
                            {questions.filter((question) => question.code !== condition.sourceQuestionCode).map((question) => <option key={question.clientId} value={question.code}>{question.code} · {question.prompt}</option>)}
                          </Select>
                        </Field>
                      </div>
                      <div className="nx-template-rule-effects">
                        <Checkbox id={`show-${condition.clientId}`} label="Show target" checked={condition.showTarget} disabled={!editable} onChange={(event) => updateCondition(condition.clientId, { showTarget: event.target.checked })} />
                        <Checkbox id={`require-${condition.clientId}`} label="Require target answer" checked={condition.requireTargetAnswer} disabled={!editable} onChange={(event) => updateCondition(condition.clientId, { requireTargetAnswer: event.target.checked })} />
                        <Checkbox id={`finding-${condition.clientId}`} label="Suggest finding" checked={condition.suggestFinding} disabled={!editable} onChange={(event) => updateCondition(condition.clientId, { suggestFinding: event.target.checked })} />
                        {editable ? <Button variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, conditions: current.conditions.filter((item) => item.clientId !== condition.clientId), evidenceRequirements: current.evidenceRequirements.filter((item) => item.conditionCode !== condition.code) }))}>Remove</Button> : null}
                      </div>
                    </article>
                  );
                })}
              </Card>

              <Card className="nx-template-rules" as="section">
                <div className="nx-template-section-heading">
                  <div><h2>Evidence requirements</h2><p>Evidence can be unconditional or activated by one stored condition.</p></div>
                  {editable && questions.length > 0 ? <Button variant="secondary" size="sm" onClick={addEvidence}>Add requirement</Button> : null}
                </div>
                {draft.evidenceRequirements.length === 0 ? <p className="nx-template-muted">No evidence requirements configured.</p> : null}
                {draft.evidenceRequirements.map((evidence) => (
                  <article className="nx-template-evidence" key={evidence.clientId}>
                    <Field label="Question" htmlFor={`evidence-question-${evidence.clientId}`}>
                      <Select id={`evidence-question-${evidence.clientId}`} disabled={!editable} value={evidence.questionCode} onChange={(event) => updateEvidence(evidence.clientId, { questionCode: event.target.value })}>
                        {questions.map((question) => <option key={question.clientId} value={question.code}>{question.code} · {question.prompt}</option>)}
                      </Select>
                    </Field>
                    <Field label="Activation condition" htmlFor={`evidence-condition-${evidence.clientId}`}>
                      <Select id={`evidence-condition-${evidence.clientId}`} disabled={!editable} value={evidence.conditionCode} onChange={(event) => updateEvidence(evidence.clientId, { conditionCode: event.target.value })}>
                        <option value="">Always required</option>
                        {draft.conditions.map((condition) => <option key={condition.clientId} value={condition.code}>{condition.code}</option>)}
                      </Select>
                    </Field>
                    <Field label="Evidence type" htmlFor={`evidence-type-${evidence.clientId}`}>
                      <Select id={`evidence-type-${evidence.clientId}`} disabled={!editable} value={evidence.evidenceType} onChange={(event) => updateEvidence(evidence.clientId, { evidenceType: event.target.value })}>
                        {EVIDENCE_TYPES.map((type) => <option value={type} key={type}>{human(type)}</option>)}
                      </Select>
                    </Field>
                    <Field label="Minimum count" htmlFor={`evidence-count-${evidence.clientId}`}>
                      <Input id={`evidence-count-${evidence.clientId}`} disabled={!editable} type="number" min={1} max={20} value={evidence.minCount} onChange={(event) => updateEvidence(evidence.clientId, { minCount: Number(event.target.value) })} />
                    </Field>
                    <Field label="Instructions" htmlFor={`evidence-instructions-${evidence.clientId}`}>
                      <Input id={`evidence-instructions-${evidence.clientId}`} disabled={!editable} value={evidence.instructions} onChange={(event) => updateEvidence(evidence.clientId, { instructions: event.target.value })} maxLength={1000} />
                    </Field>
                    {editable ? <Button variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, evidenceRequirements: current.evidenceRequirements.filter((item) => item.clientId !== evidence.clientId) }))}>Remove</Button> : null}
                  </article>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>
    </main>
  );
}