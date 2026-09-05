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

const roleId = "51000000-0000-0000-0000-000000000001";
const nationalUser = "52000000-0000-0000-0000-000000000001";
const stateUser = "52000000-0000-0000-0000-000000000002";
const districtUser = "52000000-0000-0000-0000-000000000003";
const stateA = "53000000-0000-0000-0000-000000000001";
const stateB = "53000000-0000-0000-0000-000000000002";
const districtA = "54000000-0000-0000-0000-000000000001";
const districtB = "54000000-0000-0000-0000-000000000002";
const users = [nationalUser, stateUser, districtUser];

const phase5Permissions = [
  "institution.read","institution.create","institution.update",
  "inspection.read","inspection.create","inspection.assign","inspection.perform","inspection.review",
  "evidence.read","evidence.capture","evidence.verify",
  "risk.read","risk.configure","anomaly.read","anomaly.review",
  "cctv.read","cctv.manage","cctv.live_view",
  "attendance.read","attendance.submit",
  "corrective_action.read","corrective_action.create","corrective_action.respond","corrective_action.verify",
  "report.read","report.export","audit.read","authorization.read","authorization.manage",
];

const phase7Permissions = [
  "scheme.read","scheme.create","scheme.update",
  "enrollment.read","enrollment.create","enrollment.update",
  "project.read","project.create","project.update",
  "milestone.read","milestone.create","milestone.update",
];

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
    throw new Error(`database authorization verification failed: ${result.stderr || "psql exited non-zero"}`);
  }
  return result;
}

function dbScalar(sql) {
  const result = db(sql);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

function sqlArray(values) {
  return `ARRAY[${values.map((value) => `'${sqlLiteral(value)}'`).join(",")}]::varchar[]`;
}

async function api(method, path, { body, bearer } = {}) {
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": `authz-current-ci-${Date.now()}-${Math.random()}` });
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
    throw new Error(`${context}: HTTP ${response.status}, expected ${expected}. body=${response.text.slice(0, 700)}`);
  }
}

function assertCompactJwt(token) {
  const parts = token.split(".");
  assert(parts.length === 3, "access token is not a compact JWT");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const actual = Object.keys(payload).sort();
  const expected = ["aud", "exp", "iat", "iss", "jti", "sid", "sub"].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `authorization data leaked into JWT claims: ${actual.join(",")}`);
}

async function login(email) {
  const response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  expectStatus(response, 200, `${email} login`);
  assert(response.json?.status === "AUTHENTICATED", `${email} unexpectedly requires MFA`);
  assert(response.json?.accessToken, `${email} login omitted access token`);
  assertCompactJwt(response.json.accessToken);
  return response.json.accessToken;
}

function cleanup() {
  const userArray = sqlArray(users);
  db(`
DELETE FROM user_refresh_tokens WHERE session_id IN (SELECT id FROM user_sessions WHERE user_id = ANY(${userArray}));
DELETE FROM mfa_login_challenges WHERE user_id = ANY(${userArray});
DELETE FROM user_totp WHERE user_id = ANY(${userArray});
DELETE FROM user_sessions WHERE user_id = ANY(${userArray});
DELETE FROM authentication_events WHERE user_id = ANY(${userArray});
DELETE FROM user_jurisdictions WHERE user_id = ANY(${userArray});
DELETE FROM user_roles WHERE user_id = ANY(${userArray});
DELETE FROM users WHERE id = ANY(${userArray});
DELETE FROM role_permissions WHERE role_id = '${roleId}';
DELETE FROM roles WHERE id = '${roleId}';
DELETE FROM districts WHERE id IN ('${districtA}','${districtB}');
DELETE FROM states WHERE id IN ('${stateA}','${stateB}');
SELECT 1;
`, { allowFailure: true });
}

async function main() {
  console.log("[authz-current] additive catalog invariants");
  assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='4' AND success=true;") === "1", "Flyway V4 is not successful");
  assert(dbScalar("SELECT count(*) FROM roles WHERE system_defined=true;") === "10", "system role catalog must retain exactly ten phase-5 roles");
  assert(dbScalar("SELECT count(*) FROM roles WHERE system_defined=true AND mfa_required=true;") === "7", "privileged-role MFA policy changed unexpectedly");
  assert(dbScalar(`SELECT count(*) FROM permissions WHERE code = ANY(${sqlArray(phase5Permissions)});`) === String(phase5Permissions.length), "one or more phase-5 permissions disappeared");
  assert(dbScalar(`SELECT count(*) FROM permissions WHERE code = ANY(${sqlArray(phase7Permissions)});`) === String(phase7Permissions.length), "Phase 7 permission extension is incomplete");
  const permissionCount = Number(dbScalar("SELECT count(*) FROM permissions;"));
  assert(permissionCount >= phase5Permissions.length + phase7Permissions.length, "permission catalog unexpectedly shrank");
  assert(
    Number(dbScalar("SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='SYSTEM_ADMIN';")) === permissionCount,
    "SYSTEM_ADMIN must receive the complete current permission catalog",
  );

  cleanup();
  console.log("[authz-current] create isolated non-MFA authorization fixtures");
  db(`
INSERT INTO states (id, code, name) VALUES
('${stateA}', 'AUTHCUR_A', 'Authorization Current State A'),
('${stateB}', 'AUTHCUR_B', 'Authorization Current State B');
INSERT INTO districts (id, state_id, code, name) VALUES
('${districtA}', '${stateA}', 'AUTHCUR_DA', 'Authorization Current District A'),
('${districtB}', '${stateB}', 'AUTHCUR_DB', 'Authorization Current District B');

INSERT INTO roles (id, code, display_name, description, mfa_required, system_defined)
VALUES ('${roleId}', 'CI_AUTHORIZATION_READER', 'CI Authorization Reader', 'Temporary additive authorization regression role.', FALSE, FALSE);
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${roleId}', id FROM permissions WHERE code IN ('authorization.read','institution.read','scheme.read','project.read');

INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${nationalUser}', 'ci-authz-national@nirikshanx.test', 'CI Authorization National', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${stateUser}', 'ci-authz-state@nirikshanx.test', 'CI Authorization State', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${districtUser}', 'ci-authz-district@nirikshanx.test', 'CI Authorization District', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';

INSERT INTO user_roles (id, user_id, role_id, assignment_source) VALUES
('55000000-0000-0000-0000-000000000001','${nationalUser}','${roleId}','ADMIN'),
('55000000-0000-0000-0000-000000000002','${stateUser}','${roleId}','ADMIN'),
('55000000-0000-0000-0000-000000000003','${districtUser}','${roleId}','ADMIN');
INSERT INTO user_jurisdictions (id, user_id, scope_type, state_id, district_id, assignment_source) VALUES
('56000000-0000-0000-0000-000000000001','${nationalUser}','NATIONAL',NULL,NULL,'ADMIN'),
('56000000-0000-0000-0000-000000000002','${stateUser}','STATE','${stateA}',NULL,'ADMIN'),
('56000000-0000-0000-0000-000000000003','${districtUser}','DISTRICT','${stateA}','${districtA}','ADMIN');
SELECT 1;
`);

  const national = await login("ci-authz-national@nirikshanx.test");
  const state = await login("ci-authz-state@nirikshanx.test");
  const district = await login("ci-authz-district@nirikshanx.test");

  console.log("[authz-current] effective permissions and catalog API reflect current DB state");
  let response = await api("GET", "/api/v1/authz/me", { bearer: national });
  expectStatus(response, 200, "current authorization context");
  assert(response.json?.mfaRequired === false && response.json?.mfaSatisfied === true, "non-MFA verifier role should be immediately usable");
  for (const permission of ["authorization.read", "institution.read", "scheme.read", "project.read"]) {
    assert(response.json?.effectivePermissions?.includes(permission), `${permission} missing from effective authorization context`);
  }
  response = await api("GET", "/api/v1/authz/catalog/roles", { bearer: national });
  expectStatus(response, 200, "role catalog API");
  assert(response.json.some((role) => role.code === "SYSTEM_ADMIN"), "system role catalog API omitted SYSTEM_ADMIN");
  response = await api("GET", "/api/v1/authz/catalog/permissions", { bearer: national });
  expectStatus(response, 200, "permission catalog API");
  assert(response.json.length === permissionCount, `permission catalog API count ${response.json.length} != DB count ${permissionCount}`);
  for (const permission of phase7Permissions) {
    assert(response.json.some((item) => item.code === permission), `permission catalog API omitted ${permission}`);
  }

  console.log("[authz-current] NATIONAL / STATE / DISTRICT jurisdiction boundaries");
  response = await api("GET", `/api/v1/authz/me/access/states/${stateA}`, { bearer: national });
  assert(response.status === 200 && response.json?.allowed === true, "NATIONAL scope did not allow state A");
  response = await api("GET", `/api/v1/authz/me/access/states/${stateB}`, { bearer: national });
  assert(response.json?.allowed === true, "NATIONAL scope did not allow state B");
  response = await api("GET", `/api/v1/authz/me/access/states/${stateA}`, { bearer: state });
  assert(response.json?.allowed === true, "STATE scope did not allow its own state");
  response = await api("GET", `/api/v1/authz/me/access/states/${stateB}`, { bearer: state });
  assert(response.json?.allowed === false, "STATE scope crossed its state boundary");
  response = await api("GET", `/api/v1/authz/me/access/districts/${districtA}`, { bearer: state });
  assert(response.json?.allowed === true, "STATE scope did not allow a district in its state");
  response = await api("GET", `/api/v1/authz/me/access/districts/${districtB}`, { bearer: state });
  assert(response.json?.allowed === false, "STATE scope crossed into another state");
  response = await api("GET", `/api/v1/authz/me/access/states/${stateA}`, { bearer: district });
  assert(response.json?.allowed === false, "DISTRICT scope incorrectly became state-wide authority");
  response = await api("GET", `/api/v1/authz/me/access/districts/${districtA}`, { bearer: district });
  assert(response.json?.allowed === true, "DISTRICT scope did not allow its own district");
  response = await api("GET", `/api/v1/authz/me/access/districts/${districtB}`, { bearer: district });
  assert(response.json?.allowed === false, "DISTRICT scope crossed district boundary");

  console.log("[authz-current] additive authorization regression passed");
}

cleanup();
try {
  await main();
} finally {
  cleanup();
}
