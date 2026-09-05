import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.NIRIKSHANX_WEB_BACKEND_URL ?? "http://127.0.0.1:3000/backend-api";

function envFileValue(key, fallback) {
  try {
    const text = readFileSync(".env", "utf8");
    const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1) : fallback;
  } catch {
    return fallback;
  }
}

const dbUser = envFileValue("POSTGRES_USER", "nirikshan");
const dbName = envFileValue("POSTGRES_DB", "nirikshanx");
const bootstrapEmail = envFileValue("BOOTSTRAP_USER_EMAIL", "local.operator@nirikshanx.test");
const password = envFileValue("BOOTSTRAP_USER_PASSWORD", "Local-NX-2026-Change!");
const runKey = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const authorRoleId = randomUUID();
const authorAssignmentId = randomUUID();
const readerRoleId = randomUUID();
const readerAssignmentId = randomUUID();
const readerUserId = randomUUID();
const authorRoleCode = `CI_TEMPLATE_AUTHOR_${runKey}`.slice(0, 64);
const readerRoleCode = `CI_TEMPLATE_READER_${runKey}`.slice(0, 64);
const templateCode = `CI_TEMPLATE_${runKey}`.slice(0, 64);
const readerEmail = `ci-template-${runKey}@nirikshanx.test`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function db(sql, { tuplesOnly = true, allowFailure = false } = {}) {
  const args = ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName];
  if (tuplesOnly) args.push("-tA");
  const result = spawnSync("docker", args, { input: `${sql}\n`, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`database template verification failed: ${result.stderr || "psql exited non-zero"}`);
  }
  return result;
}

function dbScalar(sql) {
  const result = db(sql);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

function dbExpectFailure(sql, context) {
  const result = db(sql, { tuplesOnly: false, allowFailure: true });
  assert(result.status !== 0, `${context}: database operation unexpectedly succeeded`);
}

async function api(method, path, { body, bearer } = {}) {
  const headers = new Headers({
    Accept: "application/json",
    "X-Request-Id": `template-ci-${Date.now()}-${Math.random()}`,
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: response.status, json, text };
}

function expectStatus(response, expected, context) {
  if (response.status !== expected) {
    throw new Error(`${context}: HTTP ${response.status}, expected ${expected}. body=${response.text.slice(0, 1000)}`);
  }
}

async function login(email) {
  const response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  expectStatus(response, 200, `${email} login`);
  assert(response.json?.status === "AUTHENTICATED", `${email} unexpectedly requires MFA`);
  assert(response.json?.accessToken, `${email} login omitted access token`);
  return response.json.accessToken;
}

function validGraph(prompt = "Is a fire extinguisher available at the inspected location?") {
  return {
    sections: [
      {
        code: "FIRE_SAFETY",
        title: "Fire safety",
        description: "CI-only generic safety section.",
        sequenceNo: 1,
        questions: [
          {
            code: "FIRE_EXTINGUISHER_AVAILABLE",
            prompt,
            helpText: "Answer from direct observation.",
            questionType: "YES_NO",
            required: true,
            sequenceNo: 1,
            options: [],
          },
          {
            code: "FIRE_REASON",
            prompt: "Record the reason when the required equipment is unavailable.",
            helpText: null,
            questionType: "LONG_TEXT",
            required: false,
            sequenceNo: 2,
            options: [],
          },
          {
            code: "ACCESS_LEVEL",
            prompt: "Select the observed access level.",
            helpText: null,
            questionType: "SINGLE_SELECT",
            required: true,
            sequenceNo: 3,
            options: [
              { value: "OPEN", label: "Open", sequenceNo: 1 },
              { value: "RESTRICTED", label: "Restricted", sequenceNo: 2 },
            ],
          },
        ],
      },
    ],
    conditions: [
      {
        code: "FIRE_NO",
        sourceQuestionCode: "FIRE_EXTINGUISHER_AVAILABLE",
        operator: "EQUALS",
        comparisonValue: "NO",
        targetQuestionCode: "FIRE_REASON",
        showTarget: true,
        requireTargetAnswer: true,
        suggestFinding: true,
        sequenceNo: 1,
      },
    ],
    evidenceRequirements: [
      {
        questionCode: "FIRE_REASON",
        conditionCode: "FIRE_NO",
        evidenceType: "PHOTO",
        minCount: 1,
        instructions: "Capture the relevant area when the condition is triggered.",
        sequenceNo: 1,
      },
    ],
  };
}

function cleanupAuthorizationFixtures() {
  db(`
DELETE FROM user_refresh_tokens WHERE session_id IN (SELECT id FROM user_sessions WHERE user_id='${readerUserId}');
DELETE FROM mfa_login_challenges WHERE user_id='${readerUserId}';
DELETE FROM user_totp WHERE user_id='${readerUserId}';
DELETE FROM user_sessions WHERE user_id='${readerUserId}';
DELETE FROM authentication_events WHERE user_id='${readerUserId}';
DELETE FROM user_roles WHERE id IN ('${authorAssignmentId}','${readerAssignmentId}') OR user_id='${readerUserId}';
DELETE FROM users WHERE id='${readerUserId}';
DELETE FROM role_permissions WHERE role_id IN ('${authorRoleId}','${readerRoleId}');
DELETE FROM roles WHERE id IN ('${authorRoleId}','${readerRoleId}');
SELECT 1;
`, { allowFailure: true });
}

async function main() {
  console.log("[templates] Flyway V7 and relational graph contracts");
  assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='7' AND success=true;") === "1", "Flyway V7 is not successful");
  assert(dbScalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('inspection_templates','inspection_template_versions','inspection_sections','inspection_questions','question_options','question_conditions','evidence_requirements');") === "7", "one or more inspection-template tables are missing");
  assert(dbScalar("SELECT count(*) FROM pg_indexes WHERE tablename='inspection_template_versions' AND indexname='uq_inspection_template_versions_one_draft';") === "1", "one-draft uniqueness index is missing");

  const typeConstraint = dbScalar("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_inspection_questions_type';");
  for (const type of ["YES_NO","TEXT","LONG_TEXT","NUMBER","DATE","SINGLE_SELECT","MULTI_SELECT","PHOTO","VIDEO","DOCUMENT","LOCATION_CONFIRMATION"]) {
    assert(typeConstraint.includes(type), `question type constraint is missing ${type}`);
  }

  console.log("[templates] install isolated non-MFA author and reader capabilities");
  cleanupAuthorizationFixtures();
  db(`
INSERT INTO roles (id, code, display_name, description, mfa_required, system_defined) VALUES
('${authorRoleId}', '${authorRoleCode}', 'CI Template Author', 'Temporary inspection-template author verifier role.', FALSE, FALSE),
('${readerRoleId}', '${readerRoleCode}', 'CI Template Reader', 'Temporary inspection-template reader verifier role.', FALSE, FALSE);
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${authorRoleId}', id FROM permissions WHERE code IN ('inspection.read','inspection.create');
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${readerRoleId}', id FROM permissions WHERE code='inspection.read';
INSERT INTO user_roles (id, user_id, role_id, assignment_source)
SELECT '${authorAssignmentId}', id, '${authorRoleId}', 'ADMIN' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${readerUserId}', '${readerEmail}', 'CI Template Reader', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO user_roles (id, user_id, role_id, assignment_source)
VALUES ('${readerAssignmentId}', '${readerUserId}', '${readerRoleId}', 'ADMIN');
SELECT 1;
`);

  const authorAccess = await login(bootstrapEmail);
  const readerAccess = await login(readerEmail);

  console.log("[templates] create stable template identity with draft version 1");
  let response = await api("POST", "/api/v1/inspection-templates", {
    bearer: authorAccess,
    body: {
      code: templateCode,
      name: "CI Versioned Inspection Template",
      description: "Ephemeral CI template used to verify generic versioned questionnaire behavior.",
    },
  });
  expectStatus(response, 200, "template create");
  const templateId = response.json?.template?.id;
  const version1 = response.json?.versions?.find((item) => item.status === "DRAFT");
  assert(templateId && version1?.id && version1.versionNo === 1, "template create did not return draft version 1");

  console.log("[templates] reject invalid graphs before persistence");
  const invalidMissingSource = validGraph();
  invalidMissingSource.conditions[0].sourceQuestionCode = "MISSING_QUESTION";
  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/draft`, {
    bearer: authorAccess,
    body: invalidMissingSource,
  });
  expectStatus(response, 400, "cross-version/missing condition source rejection");

  const invalidSelect = validGraph();
  invalidSelect.sections[0].questions[2].options = [];
  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/draft`, {
    bearer: authorAccess,
    body: invalidSelect,
  });
  expectStatus(response, 400, "select question without options rejection");

  const invalidEvidence = validGraph();
  invalidEvidence.evidenceRequirements[0].evidenceType = "AUDIO";
  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/draft`, {
    bearer: authorAccess,
    body: invalidEvidence,
  });
  expectStatus(response, 400, "unsupported evidence type rejection");

  console.log("[templates] persist valid ordered graph and publish immutable version 1");
  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/draft`, {
    bearer: authorAccess,
    body: validGraph(),
  });
  expectStatus(response, 200, "valid draft save");
  assert(response.json?.sections?.length === 1, "saved graph section count mismatch");
  assert(response.json?.sections?.[0]?.questions?.length === 3, "saved graph question count mismatch");
  assert(response.json?.conditions?.[0]?.code === "FIRE_NO", "condition graph was not persisted");
  assert(response.json?.evidenceRequirements?.[0]?.evidenceType === "PHOTO", "evidence requirement was not persisted");

  response = await api("POST", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/publish`, { bearer: authorAccess });
  expectStatus(response, 200, "publish version 1");
  assert(response.json?.version?.status === "PUBLISHED", "published version did not become PUBLISHED");
  const publishedPrompt = response.json?.sections?.[0]?.questions?.[0]?.prompt;

  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/draft`, {
    bearer: authorAccess,
    body: validGraph("Attempted mutation after publish"),
  });
  expectStatus(response, 409, "published API immutability");

  const publishedQuestionId = dbScalar(`SELECT id FROM inspection_questions WHERE version_id='${version1.id}' AND code='FIRE_EXTINGUISHER_AVAILABLE';`);
  assert(publishedQuestionId, "published question row was not found");
  dbExpectFailure(`UPDATE inspection_questions SET prompt='Direct SQL mutation must fail' WHERE id='${publishedQuestionId}';`, "published database immutability");

  console.log("[templates] clone published snapshot into draft version 2");
  response = await api("POST", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/new-version`, {
    bearer: authorAccess,
    body: { changeSummary: "CI clone verification" },
  });
  expectStatus(response, 200, "create version 2");
  const version2 = response.json?.version;
  assert(version2?.status === "DRAFT" && version2.versionNo === 2, "new version was not draft version 2");
  assert(response.json?.sections?.[0]?.questions?.[0]?.prompt === publishedPrompt, "version clone did not preserve source content");

  response = await api("PUT", `/api/v1/inspection-templates/${templateId}/versions/${version2.id}/draft`, {
    bearer: authorAccess,
    body: validGraph("Version 2 changed prompt"),
  });
  expectStatus(response, 200, "edit version 2 draft");
  assert(response.json?.sections?.[0]?.questions?.[0]?.prompt === "Version 2 changed prompt", "version 2 edit was not persisted");

  response = await api("GET", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}`, { bearer: authorAccess });
  expectStatus(response, 200, "reload published version 1");
  assert(response.json?.sections?.[0]?.questions?.[0]?.prompt === publishedPrompt, "editing version 2 changed published version 1");

  response = await api("POST", `/api/v1/inspection-templates/${templateId}/versions/${version1.id}/new-version`, {
    bearer: authorAccess,
    body: { changeSummary: "Must fail while draft exists" },
  });
  expectStatus(response, 409, "one editable draft invariant");

  console.log("[templates] read-only accounts see published versions but not author drafts");
  response = await api("GET", `/api/v1/inspection-templates/${templateId}`, { bearer: readerAccess });
  expectStatus(response, 200, "reader template detail");
  assert(response.json?.canAuthor === false, "reader unexpectedly received author capability");
  assert(response.json?.versions?.length === 1 && response.json.versions[0].status === "PUBLISHED", "reader should only see published versions");

  response = await api("GET", `/api/v1/inspection-templates/${templateId}/versions/${version2.id}`, { bearer: readerAccess });
  expectStatus(response, 404, "reader draft non-disclosure");

  response = await api("POST", "/api/v1/inspection-templates", {
    bearer: readerAccess,
    body: { code: `${templateCode}_DENY`.slice(0, 64), name: "Must not create", description: null },
  });
  expectStatus(response, 403, "reader authoring denial");

  console.log("[templates] clean temporary authorization fixtures");
  cleanupAuthorizationFixtures();
  console.log(`[templates] PASS template=${templateId} published=v1 draft=v2`);
}

main().catch((error) => {
  cleanupAuthorizationFixtures();
  console.error(error);
  process.exit(1);
});
