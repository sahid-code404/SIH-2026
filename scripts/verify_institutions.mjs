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

const managerRole = "41000000-0000-0000-0000-000000000001";
const manager = "42000000-0000-0000-0000-000000000001";
const stateReader = "42000000-0000-0000-0000-000000000002";
const districtReader = "42000000-0000-0000-0000-000000000003";
const memberAdmin = "42000000-0000-0000-0000-000000000004";
const memberNoPermission = "42000000-0000-0000-0000-000000000005";
const stateA = "43000000-0000-0000-0000-000000000001";
const stateB = "43000000-0000-0000-0000-000000000002";
const districtA = "44000000-0000-0000-0000-000000000001";
const districtB = "44000000-0000-0000-0000-000000000002";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function dbScalar(sql) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName, "-tA"],
    { input: `${sql}\n`, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`database institution verification failed: ${result.stderr || "psql exited non-zero"}`);
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

function dbExpectFailure(sql, context) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName],
    { input: `${sql}\n`, encoding: "utf8" },
  );
  assert(result.status !== 0, `${context}: database operation unexpectedly succeeded`);
}

async function api(method, path, { body, bearer } = {}) {
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": `institution-ci-${Date.now()}-${Math.random()}` });
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

async function login(email) {
  const response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  expectStatus(response, 200, `${email} login`);
  assert(response.json?.status === "AUTHENTICATED", `${email} unexpectedly requires MFA`);
  assert(response.json?.accessToken, `${email} login omitted access token`);
  return response.json.accessToken;
}

function institutionPayload(suffix, stateId, districtId, latitude, longitude) {
  return {
    code: `CI-INST-${suffix}`,
    legalName: `CI Institution ${suffix} Legal Name`,
    displayName: `CI Institution ${suffix}`,
    institutionType: "CI_TEST_TYPE",
    registrationNumber: `CI-REG-${suffix}`,
    status: "ACTIVE",
    stateId,
    districtId,
    address: `CI verification address ${suffix}`,
    postalCode: `7000${suffix === "A" ? "1" : "2"}`,
    latitude,
    longitude,
    geofenceRadiusM: 125,
    primaryContactName: `CI Contact ${suffix}`,
    primaryContactEmail: `ci-contact-${suffix.toLowerCase()}@nirikshanx.test`,
    primaryContactPhone: `+9100000000${suffix === "A" ? "1" : "2"}`,
    verificationStatus: "PENDING_REVIEW",
  };
}

console.log("[institutions] Flyway V5 and relational/PostGIS contracts");
assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='5' AND success=true;") === "1", "Flyway V5 is not successful");
assert(dbScalar("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('institutions','institution_memberships');") === "2", "institution tables are missing");
assert(dbScalar("SELECT type FROM geometry_columns WHERE f_table_name='institutions' AND f_geometry_column='location';") === "", "geography location must not be registered as geometry");
assert(dbScalar("SELECT type FROM geography_columns WHERE f_table_name='institutions' AND f_geography_column='location';") === "Point", "institution location is not PostGIS geography(Point)");
assert(dbScalar("SELECT srid FROM geography_columns WHERE f_table_name='institutions' AND f_geography_column='location';") === "4326", "institution geography SRID is not 4326");
assert(dbScalar("SELECT count(*) FROM pg_indexes WHERE tablename='institutions' AND indexname='idx_institutions_location';") === "1", "institution GiST location index is missing");

console.log("[institutions] prepare isolated authorization/geography fixtures");
dbScalar(`
INSERT INTO states (id, code, name) VALUES
('${stateA}', 'INST_A', 'Institution CI State A'),
('${stateB}', 'INST_B', 'Institution CI State B');
INSERT INTO districts (id, state_id, code, name) VALUES
('${districtA}', '${stateA}', 'INST_DA', 'Institution CI District A'),
('${districtB}', '${stateB}', 'INST_DB', 'Institution CI District B');

INSERT INTO roles (id, code, display_name, description, mfa_required, system_defined)
VALUES ('${managerRole}', 'CI_INSTITUTION_MANAGER', 'CI Institution Manager', 'Temporary isolated institution verifier role.', FALSE, FALSE);
INSERT INTO role_permissions (role_id, permission_id)
SELECT '${managerRole}', id FROM permissions WHERE code IN ('institution.read','institution.create','institution.update');

INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${manager}', 'ci-institution-manager@nirikshanx.test', 'CI Institution Manager', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${stateReader}', 'ci-state-reader@nirikshanx.test', 'CI State Reader', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${districtReader}', 'ci-district-reader@nirikshanx.test', 'CI District Reader', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${memberAdmin}', 'ci-member-admin@nirikshanx.test', 'CI Member Admin', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
SELECT '${memberNoPermission}', 'ci-member-no-permission@nirikshanx.test', 'CI Member No Permission', password_hash, 'en' FROM users WHERE email='${sqlLiteral(bootstrapEmail)}';

INSERT INTO user_roles (id, user_id, role_id, assignment_source) VALUES
('45000000-0000-0000-0000-000000000001', '${manager}', '${managerRole}', 'ADMIN'),
('45000000-0000-0000-0000-000000000002', '${stateReader}', '10000000-0000-0000-0000-000000000007', 'ADMIN'),
('45000000-0000-0000-0000-000000000003', '${districtReader}', '10000000-0000-0000-0000-000000000007', 'ADMIN'),
('45000000-0000-0000-0000-000000000004', '${memberAdmin}', '10000000-0000-0000-0000-000000000008', 'ADMIN');

INSERT INTO user_jurisdictions (id, user_id, scope_type, state_id, district_id, assignment_source) VALUES
('46000000-0000-0000-0000-000000000001', '${manager}', 'NATIONAL', NULL, NULL, 'ADMIN'),
('46000000-0000-0000-0000-000000000002', '${stateReader}', 'STATE', '${stateA}', NULL, 'ADMIN'),
('46000000-0000-0000-0000-000000000003', '${districtReader}', 'DISTRICT', '${stateA}', '${districtA}', 'ADMIN');
SELECT 1;
`);

const managerAccess = await login("ci-institution-manager@nirikshanx.test");
const stateAccess = await login("ci-state-reader@nirikshanx.test");
const districtAccess = await login("ci-district-reader@nirikshanx.test");
const memberAccess = await login("ci-member-admin@nirikshanx.test");
const noPermissionAccess = await login("ci-member-no-permission@nirikshanx.test");

console.log("[institutions] canonical geography lookup and authorized create");
let response = await api("GET", "/api/v1/geography/states", { bearer: managerAccess });
expectStatus(response, 200, "state lookup");
assert(response.json.some((state) => state.id === stateA) && response.json.some((state) => state.id === stateB), "canonical state lookup omitted CI fixtures");
response = await api("GET", `/api/v1/geography/states/${stateA}/districts`, { bearer: managerAccess });
expectStatus(response, 200, "district lookup");
assert(response.json.length === 1 && response.json[0].id === districtA, "district lookup crossed state boundary");

response = await api("POST", "/api/v1/institutions", { bearer: managerAccess, body: institutionPayload("A", stateA, districtA, 22.5726, 88.3639) });
expectStatus(response, 201, "institution A create");
const institutionA = response.json;
response = await api("POST", "/api/v1/institutions", { bearer: managerAccess, body: institutionPayload("B", stateB, districtB, 28.6139, 77.2090) });
expectStatus(response, 201, "institution B create");
const institutionB = response.json;
assert(institutionA.id && institutionB.id && institutionA.id !== institutionB.id, "institution IDs were not generated independently");
assert(dbScalar(`SELECT round(ST_Y(location::geometry)::numeric,4) FROM institutions WHERE id='${institutionA.id}';`) === "22.5726", "institution latitude was not persisted as PostGIS geography");
assert(dbScalar(`SELECT geofence_radius_m FROM institutions WHERE id='${institutionA.id}';`) === "125", "geofence radius was not persisted");

response = await api("POST", "/api/v1/institutions", { bearer: managerAccess, body: institutionPayload("X", stateA, districtB, 20, 80) });
expectStatus(response, 400, "mismatched district/state create");
assert(response.json?.type === "DISTRICT_STATE_MISMATCH", "mismatched geography did not return explicit policy error");

dbExpectFailure(`
INSERT INTO institutions (
 id,code,legal_name,display_name,institution_type,status,state_id,district_id,address,postal_code,location,geofence_radius_m,primary_contact_name,verification_status
) VALUES (
 '47000000-0000-0000-0000-000000000099','CI-BAD-GEO','Bad Geography','Bad Geography','CI_TEST_TYPE','ACTIVE','${stateA}','${districtB}','Bad','00000',ST_SetSRID(ST_MakePoint(80,20),4326)::geography,10,'Bad','PENDING_REVIEW'
);
`, "composite district/state FK");

console.log("[institutions] SQL-scoped NATIONAL / STATE / DISTRICT search and non-disclosure");
response = await api("GET", "/api/v1/institutions?size=20", { bearer: managerAccess });
expectStatus(response, 200, "national institution list");
assert(response.json.total === 2, `national scope expected 2 institutions, got ${response.json.total}`);
response = await api("GET", "/api/v1/institutions?size=20", { bearer: stateAccess });
expectStatus(response, 200, "state institution list");
assert(response.json.total === 1 && response.json.items[0].id === institutionA.id, "state scope returned an institution outside its state");
response = await api("GET", `/api/v1/institutions/${institutionB.id}`, { bearer: stateAccess });
expectStatus(response, 404, "state cross-boundary institution detail");
response = await api("GET", "/api/v1/institutions?size=20", { bearer: districtAccess });
expectStatus(response, 200, "district institution list");
assert(response.json.total === 1 && response.json.items[0].id === institutionA.id, "district scope returned an institution outside its district");
response = await api("GET", `/api/v1/institutions/${institutionB.id}`, { bearer: districtAccess });
expectStatus(response, 404, "district cross-boundary institution detail");
response = await api("GET", "/api/v1/institutions?q=CI%20Institution%20B&size=20", { bearer: districtAccess });
expectStatus(response, 200, "scoped search");
assert(response.json.total === 0 && response.json.items.length === 0, "search leaked an inaccessible institution or total count");

console.log("[institutions] membership grants ownership scope but never RBAC permission");
response = await api("GET", "/api/v1/institutions?size=20", { bearer: memberAccess });
expectStatus(response, 200, "member before assignment list");
assert(response.json.total === 0, "unassigned institution admin had institution scope");
response = await api("POST", `/api/v1/institutions/${institutionA.id}/memberships`, { bearer: managerAccess, body: { userId: memberAdmin } });
expectStatus(response, 201, "member admin assignment");
const memberAssignment = response.json;
response = await api("POST", `/api/v1/institutions/${institutionA.id}/memberships`, { bearer: managerAccess, body: { userId: memberNoPermission } });
expectStatus(response, 201, "no-permission membership assignment");

response = await api("GET", `/api/v1/institutions/${institutionA.id}`, { bearer: memberAccess });
expectStatus(response, 200, "member own-institution detail");
response = await api("GET", `/api/v1/institutions/${institutionB.id}`, { bearer: memberAccess });
expectStatus(response, 404, "member cross-institution detail");
response = await api("GET", "/api/v1/institutions", { bearer: noPermissionAccess });
expectStatus(response, 403, "membership without institution.read");

const updatedA = { ...institutionPayload("A", stateA, districtA, 22.5726, 88.3639), displayName: "CI Institution A Updated" };
response = await api("PUT", `/api/v1/institutions/${institutionA.id}`, { bearer: memberAccess, body: updatedA });
expectStatus(response, 200, "member-admin own-institution update");
assert(response.json.displayName === "CI Institution A Updated", "allowed institution update was not persisted");
const relocation = { ...updatedA, stateId: stateB, districtId: districtB };
response = await api("PUT", `/api/v1/institutions/${institutionA.id}`, { bearer: memberAccess, body: relocation });
expectStatus(response, 403, "member-admin unauthorized geographic relocation");

response = await api("POST", `/api/v1/institutions/${institutionA.id}/memberships/${memberAssignment.id}/revoke`, {
  bearer: managerAccess,
  body: { reason: "CI immediate membership revocation verification" },
});
expectStatus(response, 204, "membership revocation");
response = await api("GET", `/api/v1/institutions/${institutionA.id}`, { bearer: memberAccess });
expectStatus(response, 404, "same-token access after membership revocation");
assert(dbScalar(`SELECT count(*) FROM institution_memberships WHERE id='${memberAssignment.id}' AND revoked_at IS NOT NULL;`) === "1", "membership revocation history was not preserved");

console.log("[institutions] cleanup restores the fresh stack for existing authentication regression");
const testUsers = [manager, stateReader, districtReader, memberAdmin, memberNoPermission].map((id) => `'${id}'`).join(",");
dbScalar(`
DELETE FROM institution_memberships WHERE institution_id IN ('${institutionA.id}','${institutionB.id}');
DELETE FROM institutions WHERE id IN ('${institutionA.id}','${institutionB.id}');
DELETE FROM user_refresh_tokens WHERE session_id IN (SELECT id FROM user_sessions WHERE user_id IN (${testUsers}));
DELETE FROM mfa_login_challenges WHERE user_id IN (${testUsers});
DELETE FROM user_sessions WHERE user_id IN (${testUsers});
DELETE FROM authentication_events WHERE user_id IN (${testUsers});
DELETE FROM user_totp WHERE user_id IN (${testUsers});
DELETE FROM user_jurisdictions WHERE user_id IN (${testUsers});
DELETE FROM user_roles WHERE user_id IN (${testUsers});
DELETE FROM users WHERE id IN (${testUsers});
DELETE FROM role_permissions WHERE role_id='${managerRole}';
DELETE FROM roles WHERE id='${managerRole}';
DELETE FROM districts WHERE id IN ('${districtA}','${districtB}');
DELETE FROM states WHERE id IN ('${stateA}','${stateB}');
SELECT 1;
`);
assert(dbScalar("SELECT count(*) FROM roles;") === "10", "temporary institution verifier role was not cleaned up");
assert(dbScalar("SELECT count(*) FROM institutions;") === "0", "institution verification fixtures were not cleaned up");
assert(dbScalar(`SELECT count(*) FROM users WHERE id IN (${testUsers});`) === "0", "institution verifier users were not cleaned up");

console.log("[institutions] canonical model, PostGIS, scoped search and membership revocation verification passed");
