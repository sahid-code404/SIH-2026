import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

const managerRole = "61000000-0000-0000-0000-000000000001";
const readerRole = "61000000-0000-0000-0000-000000000002";
const noProgramRole = "61000000-0000-0000-0000-000000000003";
const manager = "62000000-0000-0000-0000-000000000001";
const stateReader = "62000000-0000-0000-0000-000000000002";
const districtReader = "62000000-0000-0000-0000-000000000003";
const memberReader = "62000000-0000-0000-0000-000000000004";
const memberNoPermission = "62000000-0000-0000-0000-000000000005";
const stateA = "63000000-0000-0000-0000-000000000001";
const stateB = "63000000-0000-0000-0000-000000000002";
const districtA = "64000000-0000-0000-0000-000000000001";
const districtB = "64000000-0000-0000-0000-000000000002";
const institutionA = "65000000-0000-0000-0000-000000000001";
const institutionB = "65000000-0000-0000-0000-000000000002";
const memberAssignment = "66000000-0000-0000-0000-000000000001";
const noPermissionAssignment = "66000000-0000-0000-0000-000000000002";

const fixtureUsers = [manager, stateReader, districtReader, memberReader, memberNoPermission];
const fixtureRoles = [managerRole, readerRole, noProgramRole];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function idList(values) {
  return values.map((value) => `'${sqlLiteral(value)}'`).join(",");
}

function db(sql, { tuplesOnly = true, allowFailure = false } = {}) {
  const args = ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName];
  if (tuplesOnly) args.push("-tA");
  const result = spawnSync("docker", args, { input: `${sql}\n`, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`database program verification failed: ${result.stderr || "psql exited non-zero"}`);
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
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": `program-ci-${Date.now()}-${Math.random()}` });
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
    throw new Error(`${context}: HTTP ${response.status}, expected ${expected}. body=${response.text.slice(0, 800)}`);
  }
}

async function login(email) {
  const response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  expectStatus(response, 200, `${email} login`);
  assert(response.json?.status === "AUTHENTICATED", `${email} unexpectedly requires MFA`);
  assert(response.json?.accessToken, `${email} login omitted access token`);
  return response.json.accessToken;
}

function cleanup() {
  const users = idList(fixtureUsers);
  const roles = idList(fixtureRoles);
  db(`
DELETE FROM user_refresh_tokens WHERE session_id IN (SELECT id FROM user_sessions WHERE user_id IN (${users}));
DELETE FROM mfa_login_challenges WHERE user_id IN (${users});
DELETE FROM user_totp WHERE user_id IN (${users});
DELETE FROM user_sessions WHERE user_id IN (${users});
DELETE FROM authentication_events WHERE user_id IN (${users});
DELETE FROM project_milestones WHERE project_id IN (
  SELECT p.id FROM projects p JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id
  WHERE e.institution_id IN ('${institutionA}','${institutionB}')
);
DELETE FROM projects WHERE enrollment_id IN (
  SELECT id FROM institution_scheme_enrollments WHERE institution_id IN ('${institutionA}','${institutionB}')
);
DELETE FROM institution_scheme_enrollments WHERE institution_id IN ('${institutionA}','${institutionB}');
DELETE FROM schemes WHERE code LIKE 'CI-SCHEME-%';
DELETE FROM institution_memberships WHERE institution_id IN ('${institutionA}','${institutionB}') OR user_id IN (${users});
DELETE FROM institutions WHERE id IN ('${institutionA}','${institutionB}');
DELETE FROM user_jurisdictions WHERE user_id IN (${users});
DELETE FROM user_roles WHERE user_id IN (${users});
DELETE FROM users WHERE id IN (${users});
DELETE FROM role_permissions WHERE role_id IN (${roles});
DELETE FROM roles WHERE id IN (${roles});
DELETE FROM districts WHERE id IN ('${districtA}','${districtB}');
DELETE FROM states WHERE id IN ('${stateA}','${stateB}');
SELECT 1;
`, { allowFailure: true });
}

async function main() {
  console.log("[programs] Flyway V6 and relational contracts");
  assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='6' AND success=true;") === "1", "Flyway V6 is not successful");
  assert(dbScalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('schemes','institution_scheme_enrollments','projects','project_milestones');") === "4", "one or more Phase 7 tables are missing");
  assert(dbScalar("SELECT count(*) FROM information_schema.columns WHERE table_name='projects' AND column_name IN ('institution_id','scheme_id');") === "0", "projects must inherit institution/scheme canonically through enrollment_id");
  assert(dbScalar("SELECT count(*) FROM pg_indexes WHERE tablename='institution_scheme_enrollments' AND indexname='uq_scheme_enrollments_active';") === "1", "active-enrollment uniqueness index is missing");
  assert(dbScalar("SELECT count(*) FROM pg_indexes WHERE tablename='project_milestones' AND indexname='uq_project_milestones_sequence';") === "1", "milestone sequence uniqueness contract is missing");
  assert(dbScalar("SELECT count(*) FROM permissions WHERE code IN ('scheme.read','scheme.create','scheme.update','enrollment.read','enrollment.create','enrollment.update','project.read','project.create','project.update','milestone.read','milestone.create','milestone.update');") === "12", "Phase 7 permission catalog is incomplete");

  cleanup();
  console.log("[programs] prepare isolated institutions and authorization fixtures");
  db(`
INSERT INTO states (id, code, name) VALUES
('${stateA}', 'PROG_A', 'Program CI State A'),
('${stateB}', 'PROG_B', 'Program CI State B');
INSERT INTO districts (id, state_id, code, name) VALUES
('${districtA}', '${stateA}', 'PROG_DA', 'Program CI District A'),
('${districtB}', '${stateB}', 'PROG_DB', 'Program CI District B');
INSERT INTO institutions (
  id, code, legal_name, display_name, institution_type, registration_number, status,
  state_id, district_id, address, postal_code, location, geofence_radius_m,
  primary_contact_name, primary_contact_email, verification_status
) VALUES
('${institutionA}', 'CI-PROG-INST-A', 'Program CI Institution A Legal', 'Program CI Institution A', 'CI_TEST_TYPE', 'CI-PROG-REG-A', 'ACTIVE',
 '${stateA}', '${districtA}', 'Program CI Address A', '700001', ST_SetSRID(ST_MakePoint(88.3639,22.5726),4326)::geography, 125,
 'Program Contact A', 'program-a@nirikshanx.test', 'PENDING_REVIEW'),
('${institutionB}', 'CI-PROG-INST-B', 'Program CI Institution B Legal', 'Program CI Institution B', 'CI_TEST_TYPE', 'CI-PROG-REG-B', 'ACTIVE',
 '${stateB}', '${districtB}', 'Program CI Address B', '110001', ST_SetSRID(ST_MakePoint(77.2090,28.6139),4326)::geography, 125,
 'Program Contact B', 'program-b@nirikshanx.test', 'PENDING_REVIEW');

INSERT INTO roles (id, code, display_name, description, mfa_required, system_defined) VALUES
('${managerRole}', 'CI_PROGRAM_MANAGER', 'CI Program Manager', 'Temporary full Phase 7 verifier role.', FALSE, FALSE),
('${readerRole}', 'CI_PROGRAM_READER', 'CI Program Reader', 'Temporary read-only Phase 7 verifier role.', FALSE, FALSE),
('${noProgramRole}', 'CI_PROGRAM_NO_ACCESS', 'CI Program No Access', 'Temporary role without Phase 7 program capability.', FALSE, FALSE);
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${managerRole}', id FROM permissions WHERE code IN (
 'scheme.read','scheme.create','scheme.update','enrollment.read','enrollment.create','enrollment.update',
 'project.read','project.create','project.update','milestone.read','milestone.create','milestone.update'
);
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${readerRole}', id FROM permissions WHERE code IN ('scheme.read','enrollment.read','project.read','milestone.read');
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${noProgramRole}', id FROM permissions WHERE code='institution.read';

INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${manager}', 'ci-program-manager@nirikshanx.test', 'CI Program Manager', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${stateReader}', 'ci-program-state@nirikshanx.test', 'CI Program State Reader', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${districtReader}', 'ci-program-district@nirikshanx.test', 'CI Program District Reader', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${memberReader}', 'ci-program-member@nirikshanx.test', 'CI Program Member', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${memberNoPermission}', 'ci-program-no-permission@nirikshanx.test', 'CI Program No Permission', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';

INSERT INTO user_roles (id, user_id, role_id, assignment_source) VALUES
('67000000-0000-0000-0000-000000000001','${manager}','${managerRole}','ADMIN'),
('67000000-0000-0000-0000-000000000002','${stateReader}','${readerRole}','ADMIN'),
('67000000-0000-0000-0000-000000000003','${districtReader}','${readerRole}','ADMIN'),
('67000000-0000-0000-0000-000000000004','${memberReader}','${readerRole}','ADMIN'),
('67000000-0000-0000-0000-000000000005','${memberNoPermission}','${noProgramRole}','ADMIN');
INSERT INTO user_jurisdictions (id, user_id, scope_type, state_id, district_id, assignment_source) VALUES
('68000000-0000-0000-0000-000000000001','${manager}','NATIONAL',NULL,NULL,'ADMIN'),
('68000000-0000-0000-0000-000000000002','${stateReader}','STATE','${stateA}',NULL,'ADMIN'),
('68000000-0000-0000-0000-000000000003','${districtReader}','DISTRICT','${stateA}','${districtA}','ADMIN');
INSERT INTO institution_memberships (id, institution_id, user_id, assignment_source) VALUES
('${memberAssignment}','${institutionA}','${memberReader}','ADMIN'),
('${noPermissionAssignment}','${institutionA}','${memberNoPermission}','ADMIN');
SELECT 1;
`);

  const managerAccess = await login("ci-program-manager@nirikshanx.test");
  const stateAccess = await login("ci-program-state@nirikshanx.test");
  const districtAccess = await login("ci-program-district@nirikshanx.test");
  const memberAccess = await login("ci-program-member@nirikshanx.test");
  const noPermissionAccess = await login("ci-program-no-permission@nirikshanx.test");

  console.log("[programs] scheme catalog is generic and permission-backed");
  let response = await api("POST", "/api/v1/schemes", {
    bearer: managerAccess,
    body: {
      code: "CI-SCHEME-GENERIC",
      name: "CI Scheme-Agnostic Verification Program",
      shortName: "CI Generic",
      description: "CI-only generic scheme fixture; no production policy semantics.",
      status: "ACTIVE",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    },
  });
  expectStatus(response, 200, "scheme create");
  const scheme = response.json;
  assert(scheme?.id && scheme.code === "CI-SCHEME-GENERIC", "scheme create returned an unexpected record");
  response = await api("GET", "/api/v1/schemes?q=CI-SCHEME&size=10", { bearer: stateAccess });
  expectStatus(response, 200, "scheme catalog search");
  assert(response.json.total === 1 && response.json.items[0].id === scheme.id, "scheme catalog search did not return the generic fixture");

  console.log("[programs] create canonical enrollments and projects through enrollment_id");
  response = await api("POST", "/api/v1/enrollments", {
    bearer: managerAccess,
    body: { institutionId: institutionA, schemeId: scheme.id, enrollmentCode: "CI-ENROLL-A", status: "ACTIVE", enrolledOn: "2026-01-10", endedOn: null },
  });
  expectStatus(response, 200, "institution A enrollment create");
  const enrollmentA = response.json;
  response = await api("POST", "/api/v1/enrollments", {
    bearer: managerAccess,
    body: { institutionId: institutionB, schemeId: scheme.id, enrollmentCode: "CI-ENROLL-B", status: "ACTIVE", enrolledOn: "2026-01-11", endedOn: null },
  });
  expectStatus(response, 200, "institution B enrollment create");
  const enrollmentB = response.json;

  response = await api("POST", "/api/v1/projects", {
    bearer: managerAccess,
    body: {
      enrollmentId: enrollmentA.id,
      code: "CI-PROJECT-A",
      title: "CI Project A",
      description: "Program verifier project for institution A.",
      status: "PLANNED",
      plannedStartOn: "2026-02-01",
      plannedEndOn: "2026-08-31",
      actualStartOn: null,
      actualEndOn: null,
    },
  });
  expectStatus(response, 200, "project A create");
  const projectA = response.json;
  response = await api("POST", "/api/v1/projects", {
    bearer: managerAccess,
    body: {
      enrollmentId: enrollmentB.id,
      code: "CI-PROJECT-B",
      title: "CI Project B",
      description: "Program verifier project for institution B.",
      status: "PLANNED",
      plannedStartOn: "2026-03-01",
      plannedEndOn: "2026-09-30",
      actualStartOn: null,
      actualEndOn: null,
    },
  });
  expectStatus(response, 200, "project B create");
  const projectB = response.json;
  assert(projectA.institutionId === institutionA && projectA.schemeId === scheme.id, "project A did not resolve its canonical institution/scheme from enrollment");
  assert(projectB.institutionId === institutionB && projectB.schemeId === scheme.id, "project B did not resolve its canonical institution/scheme from enrollment");

  response = await api("POST", `/api/v1/projects/${projectA.id}/milestones`, {
    bearer: managerAccess,
    body: { sequenceNo: 1, code: "CI-M1", title: "CI Milestone One", description: "First verifier milestone.", status: "PLANNED", dueOn: "2026-04-01", completedAt: null },
  });
  expectStatus(response, 200, "milestone create");
  const milestone = response.json;
  assert(milestone.sequenceNo === 1 && milestone.projectId === projectA.id, "milestone was not attached to project A");

  console.log("[programs] database uniqueness and relational invariants");
  dbExpectFailure(`INSERT INTO institution_scheme_enrollments (id,institution_id,scheme_id,status,enrolled_on) VALUES ('69000000-0000-0000-0000-000000000001','${institutionA}','${scheme.id}','ACTIVE','2026-02-01');`, "duplicate active enrollment");
  dbExpectFailure(`INSERT INTO project_milestones (id,project_id,sequence_no,title,status) VALUES ('69000000-0000-0000-0000-000000000002','${projectA.id}',1,'Duplicate sequence','PLANNED');`, "duplicate milestone sequence");
  assert(dbScalar(`SELECT e.institution_id || ':' || e.scheme_id FROM projects p JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id WHERE p.id='${projectA.id}';`) === `${institutionA}:${scheme.id}`, "project canonical parent relationship is inconsistent");

  console.log("[programs] NATIONAL / STATE / DISTRICT scope and non-disclosure");
  response = await api("GET", "/api/v1/projects?size=20", { bearer: managerAccess });
  expectStatus(response, 200, "national project list");
  assert(response.json.total === 2, `national scope expected two projects, got ${response.json.total}`);
  response = await api("GET", "/api/v1/projects?size=20", { bearer: stateAccess });
  expectStatus(response, 200, "state project list");
  assert(response.json.total === 1 && response.json.items[0].id === projectA.id, "state scope leaked project B");
  response = await api("GET", `/api/v1/projects/${projectB.id}`, { bearer: stateAccess });
  expectStatus(response, 404, "state cross-boundary project detail");
  response = await api("GET", "/api/v1/projects?q=CI%20Project%20B&size=20", { bearer: stateAccess });
  expectStatus(response, 200, "state scoped project search");
  assert(response.json.total === 0 && response.json.items.length === 0, "state search leaked hidden project existence or count");
  response = await api("GET", `/api/v1/enrollments/${enrollmentB.id}`, { bearer: districtAccess });
  expectStatus(response, 404, "district cross-boundary enrollment detail");
  response = await api("GET", `/api/v1/projects/${projectB.id}/milestones`, { bearer: districtAccess });
  expectStatus(response, 404, "district cross-boundary milestone parent");
  response = await api("GET", `/api/v1/projects/${projectA.id}/milestones`, { bearer: districtAccess });
  expectStatus(response, 200, "district own-scope milestones");
  assert(response.json.length === 1 && response.json[0].id === milestone.id, "district own-scope milestone was not visible");

  console.log("[programs] membership gives exact scope but does not bypass RBAC");
  response = await api("GET", "/api/v1/projects?size=20", { bearer: memberAccess });
  expectStatus(response, 200, "member project list");
  assert(response.json.total === 1 && response.json.items[0].id === projectA.id, "member scope did not stay on exact institution A");
  response = await api("GET", `/api/v1/projects/${projectB.id}`, { bearer: memberAccess });
  expectStatus(response, 404, "member cross-institution project detail");
  response = await api("GET", "/api/v1/projects?size=20", { bearer: noPermissionAccess });
  expectStatus(response, 403, "membership without project.read");

  console.log("[programs] membership revocation takes effect on the next request");
  db(`UPDATE institution_memberships SET revoked_at=CURRENT_TIMESTAMP, revocation_reason='CI program membership revocation' WHERE id='${memberAssignment}'; SELECT 1;`);
  response = await api("GET", "/api/v1/projects?size=20", { bearer: memberAccess });
  expectStatus(response, 200, "member project list after revocation");
  assert(response.json.total === 0 && response.json.items.length === 0, "revoked membership still granted project scope");
  response = await api("GET", `/api/v1/projects/${projectA.id}`, { bearer: memberAccess });
  expectStatus(response, 404, "revoked member project detail");

  console.log("[programs] validation and lifecycle constraints");
  response = await api("POST", "/api/v1/enrollments", {
    bearer: managerAccess,
    body: { institutionId: institutionA, schemeId: scheme.id, enrollmentCode: "CI-ENROLL-DUP", status: "ACTIVE", enrolledOn: "2026-05-01", endedOn: null },
  });
  expectStatus(response, 409, "duplicate active enrollment API");
  response = await api("POST", `/api/v1/projects/${projectA.id}/milestones`, {
    bearer: managerAccess,
    body: { sequenceNo: 1, code: "CI-M2", title: "Duplicate milestone", description: null, status: "PLANNED", dueOn: null, completedAt: null },
  });
  expectStatus(response, 409, "duplicate milestone sequence API");

  console.log("[programs] scheme-agnostic program verifier passed");
}

cleanup();
try {
  await main();
} finally {
  cleanup();
}
