import { createHmac } from "node:crypto";
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
const email = process.env.AUTHZ_TEST_EMAIL ?? envFileValue("BOOTSTRAP_USER_EMAIL", "local.operator@nirikshanx.test");
const password = process.env.AUTHZ_TEST_PASSWORD ?? envFileValue("BOOTSTRAP_USER_PASSWORD", "Local-NX-2026-Change!");

const stateA = "31000000-0000-0000-0000-000000000001";
const stateB = "31000000-0000-0000-0000-000000000002";
const districtA = "32000000-0000-0000-0000-000000000001";
const districtB = "32000000-0000-0000-0000-000000000002";
const backupAdmin = "33000000-0000-0000-0000-000000000001";
const resetRoleAssignment = "34000000-0000-0000-0000-000000000001";
const resetJurisdictionAssignment = "35000000-0000-0000-0000-000000000001";

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
  if (result.status !== 0) {
    throw new Error(`database authorization verification failed: ${result.stderr || "psql exited non-zero"}`);
  }
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

async function api(method, path, { body, bearer } = {}) {
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": `authz-ci-${Date.now()}-${Math.random()}` });
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
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

function expectStatus(response, expected, context) {
  if (response.status !== expected) {
    throw new Error(`${context}: HTTP ${response.status}, expected ${expected}. body=${response.text.slice(0, 700)}`);
  }
}

function jwtPayload(token) {
  const parts = token.split(".");
  assert(parts.length === 3, "access token is not a compact JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function assertJwtStillCompact(token) {
  const actual = Object.keys(jwtPayload(token)).sort();
  const expected = ["aud", "exp", "iat", "iss", "jti", "sid", "sub"].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `authorization data leaked into JWT claims: ${actual.join(",")}`);
}

function decodeBase32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/g, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    assert(value >= 0, "TOTP enrollment returned invalid base32");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, counterOffset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + counterOffset;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

console.log("[authz] Flyway V4, deterministic catalog and bootstrap authorization");
assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='4' AND success=true;") === "1", "Flyway V4 is not successful");
assert(dbScalar("SELECT count(*) FROM roles;") === "10", "role catalog must contain exactly ten system roles");
assert(dbScalar("SELECT count(*) FROM permissions;") === "29", "permission catalog must contain exactly 29 phase-5 permissions");
assert(dbScalar("SELECT count(*) FROM roles WHERE system_defined=true;") === "10", "all phase-5 roles must be system-defined");
assert(dbScalar("SELECT count(*) FROM roles WHERE mfa_required=true;") === "7", "privileged-role MFA policy is not deterministic");
const bootstrapUserId = dbScalar(`SELECT id FROM users WHERE email='${sqlLiteral(email)}';`);
assert(bootstrapUserId, "bootstrap user is missing");
assert(dbScalar(`SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id='${bootstrapUserId}' AND r.code='SYSTEM_ADMIN' AND ur.revoked_at IS NULL;`) === "1", "bootstrap SYSTEM_ADMIN assignment is missing");
assert(dbScalar(`SELECT count(*) FROM user_jurisdictions WHERE user_id='${bootstrapUserId}' AND scope_type='NATIONAL' AND revoked_at IS NULL;`) === "1", "bootstrap NATIONAL jurisdiction is missing");

console.log("[authz] privileged permissions are withheld before MFA");
let response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
expectStatus(response, 200, "bootstrap login");
assert(response.json?.status === "AUTHENTICATED", "fresh bootstrap login unexpectedly required MFA");
let access = response.json.accessToken;
assertJwtStillCompact(access);
response = await api("GET", "/api/v1/authz/me", { bearer: access });
expectStatus(response, 200, "authorization self context");
assert(response.json?.roles?.some((role) => role.code === "SYSTEM_ADMIN"), "SYSTEM_ADMIN role not resolved");
assert(response.json?.jurisdictions?.some((scope) => scope.scopeType === "NATIONAL"), "NATIONAL scope not resolved");
assert(response.json?.mfaRequired === true, "SYSTEM_ADMIN must require MFA");
assert(response.json?.mfaEnabled === false, "fresh bootstrap account should not already have TOTP");
assert(response.json?.sessionMfaVerified === false, "password-only session must not be MFA verified");
assert(response.json?.effectivePermissions?.length === 0, "privileged permissions leaked before MFA");
assert(response.json?.withheldPermissions?.includes("authorization.manage"), "authorization.manage should be visibly withheld by MFA policy");
response = await api("GET", "/api/v1/authz/catalog/roles", { bearer: access });
expectStatus(response, 403, "authorization catalog before MFA");

console.log("[authz] enrollment does not silently elevate the pre-existing password-only session");
response = await api("POST", "/api/v1/auth/mfa/totp/enroll", { bearer: access });
expectStatus(response, 200, "TOTP enrollment");
const secret = response.json?.secret;
assert(secret, "TOTP enrollment secret is missing");
response = await api("POST", "/api/v1/auth/mfa/totp/confirm", { bearer: access, body: { code: totp(secret, 0) } });
expectStatus(response, 204, "TOTP enrollment confirmation");
response = await api("GET", "/api/v1/authz/me", { bearer: access });
expectStatus(response, 200, "authorization context after enrollment");
assert(response.json?.mfaEnabled === true, "TOTP enablement was not observed");
assert(response.json?.sessionMfaVerified === false, "pre-enrollment session was incorrectly promoted to MFA assurance");
assert(response.json?.effectivePermissions?.length === 0, "old session gained privileged permissions without MFA reauthentication");
response = await api("POST", "/api/v1/auth/logout", { bearer: access });
expectStatus(response, 204, "logout before MFA-authenticated login");

response = await api("POST", "/api/v1/auth/login", { body: { email, password } });
expectStatus(response, 200, "MFA password stage");
assert(response.json?.status === "MFA_REQUIRED", "TOTP-enabled privileged user did not require MFA");
const challenge = response.json.mfaChallengeToken;
response = await api("POST", "/api/v1/auth/mfa/login/verify", { body: { challengeToken: challenge, code: totp(secret, 1) } });
expectStatus(response, 200, "MFA verification");
access = response.json.accessToken;
assertJwtStillCompact(access);
response = await api("GET", "/api/v1/authz/me", { bearer: access });
expectStatus(response, 200, "MFA authorization context");
assert(response.json?.sessionMfaVerified === true, "new MFA login session was not recognized as MFA verified");
assert(response.json?.mfaSatisfied === true, "privileged MFA policy is not satisfied after MFA login");
assert(response.json?.effectivePermissions?.includes("authorization.manage"), "SYSTEM_ADMIN authorization.manage was not released after MFA");
response = await api("GET", "/api/v1/authz/catalog/roles", { bearer: access });
expectStatus(response, 200, "role catalog after MFA");
assert(response.json?.length === 10, "role catalog API returned unexpected role count");
response = await api("GET", "/api/v1/authz/catalog/permissions", { bearer: access });
expectStatus(response, 200, "permission catalog after MFA");
assert(response.json?.length === 29, "permission catalog API returned unexpected permission count");

console.log("[authz] relational geography consistency and NATIONAL/STATE/DISTRICT boundaries");
dbScalar(`
INSERT INTO states (id, code, name) VALUES
('${stateA}', 'AUTHZ_A', 'Authorization Test State A'),
('${stateB}', 'AUTHZ_B', 'Authorization Test State B');
INSERT INTO districts (id, state_id, code, name) VALUES
('${districtA}', '${stateA}', 'AUTHZ_DA', 'Authorization Test District A'),
('${districtB}', '${stateB}', 'AUTHZ_DB', 'Authorization Test District B');
INSERT INTO users (id, email, display_name, password_hash, preferred_language)
VALUES ('${backupAdmin}', 'authz-backup-admin@nirikshanx.test', 'Authorization Backup Admin', 'not-used-by-authorization-verifier', 'en');
SELECT 1;
`);

response = await api("POST", `/api/v1/authz/users/${backupAdmin}/roles`, { bearer: access, body: { roleCode: "SYSTEM_ADMIN" } });
expectStatus(response, 200, "backup SYSTEM_ADMIN assignment");
response = await api("POST", `/api/v1/authz/users/${backupAdmin}/jurisdictions`, { bearer: access, body: { scopeType: "NATIONAL", stateId: null, districtId: null } });
expectStatus(response, 200, "backup NATIONAL assignment");

response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions`, { bearer: access, body: { scopeType: "DISTRICT", stateId: stateA, districtId: districtB } });
expectStatus(response, 400, "district/state mismatch");
assert(response.json?.type === "DISTRICT_STATE_MISMATCH", "district/state mismatch did not return the expected policy error");

let context = (await api("GET", "/api/v1/authz/me", { bearer: access })).json;
const originalNational = context.jurisdictions.find((scope) => scope.scopeType === "NATIONAL");
assert(originalNational, "original NATIONAL scope is missing");
response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions`, { bearer: access, body: { scopeType: "STATE", stateId: stateA, districtId: null } });
expectStatus(response, 200, "STATE scope assignment");
const stateAssignment = response.json;
response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions/${originalNational.assignmentId}/revoke`, { bearer: access, body: { reason: "CI state-boundary verification" } });
expectStatus(response, 204, "NATIONAL scope revocation");

response = await api("GET", `/api/v1/authz/me/access/states/${stateA}`, { bearer: access });
expectStatus(response, 200, "state A access check");
assert(response.json?.allowed === true, "state scope did not allow its own state");
response = await api("GET", `/api/v1/authz/me/access/states/${stateB}`, { bearer: access });
assert(response.json?.allowed === false, "state scope crossed state boundary");
response = await api("GET", `/api/v1/authz/me/access/districts/${districtA}`, { bearer: access });
assert(response.json?.allowed === true, "state scope did not allow a district in its state");
response = await api("GET", `/api/v1/authz/me/access/districts/${districtB}`, { bearer: access });
assert(response.json?.allowed === false, "state scope crossed into another state's district");

response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions`, { bearer: access, body: { scopeType: "DISTRICT", stateId: stateA, districtId: districtA } });
expectStatus(response, 200, "DISTRICT scope assignment");
const districtAssignment = response.json;
response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions/${stateAssignment.assignmentId}/revoke`, { bearer: access, body: { reason: "CI district-boundary verification" } });
expectStatus(response, 204, "STATE scope revocation");
response = await api("GET", `/api/v1/authz/me/access/states/${stateA}`, { bearer: access });
assert(response.json?.allowed === false, "district scope incorrectly granted state-wide access");
response = await api("GET", `/api/v1/authz/me/access/districts/${districtA}`, { bearer: access });
assert(response.json?.allowed === true, "district scope did not allow its own district");
response = await api("GET", `/api/v1/authz/me/access/districts/${districtB}`, { bearer: access });
assert(response.json?.allowed === false, "district scope crossed district boundary");

response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions`, { bearer: access, body: { scopeType: "NATIONAL", stateId: null, districtId: null } });
expectStatus(response, 200, "NATIONAL scope restoration");
response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/jurisdictions/${districtAssignment.assignmentId}/revoke`, { bearer: access, body: { reason: "CI national-boundary verification complete" } });
expectStatus(response, 204, "DISTRICT scope revocation");
response = await api("GET", `/api/v1/authz/me/access/states/${stateB}`, { bearer: access });
assert(response.json?.allowed === true, "NATIONAL scope did not allow another state");
response = await api("GET", `/api/v1/authz/me/access/districts/${districtB}`, { bearer: access });
assert(response.json?.allowed === true, "NATIONAL scope did not allow another district");

console.log("[authz] role revocation takes effect on the next request without JWT replacement");
response = await api("POST", `/api/v1/authz/users/${bootstrapUserId}/roles/SYSTEM_ADMIN/revoke`, { bearer: access, body: { reason: "CI immediate-revocation verification" } });
expectStatus(response, 204, "self SYSTEM_ADMIN revocation with backup administrator present");
response = await api("GET", "/api/v1/authz/catalog/roles", { bearer: access });
expectStatus(response, 403, "catalog after immediate role revocation");
response = await api("GET", "/api/v1/authz/me", { bearer: access });
expectStatus(response, 200, "self context after role revocation");
assert(!response.json?.roles?.some((role) => role.code === "SYSTEM_ADMIN"), "revoked role remained active in authorization context");

// Restore directly because the caller intentionally removed its own management authority.
dbScalar(`
INSERT INTO user_roles (id, user_id, role_id, assignment_source)
SELECT '${resetRoleAssignment}', '${bootstrapUserId}', id, 'BOOTSTRAP' FROM roles WHERE code='SYSTEM_ADMIN';
SELECT 1;
`);
response = await api("GET", "/api/v1/authz/catalog/roles", { bearer: access });
expectStatus(response, 200, "catalog after database-backed role restoration on same JWT");

console.log("[authz] cleanup preserves the fresh-stack contract for the authentication regression verifier");
response = await api("POST", "/api/v1/auth/logout-all", { bearer: access });
expectStatus(response, 204, "authorization verifier logout-all");
dbScalar(`
DELETE FROM user_jurisdictions WHERE user_id IN ('${bootstrapUserId}', '${backupAdmin}');
DELETE FROM user_roles WHERE user_id IN ('${bootstrapUserId}', '${backupAdmin}');
INSERT INTO user_roles (id, user_id, role_id, assignment_source)
SELECT '${resetRoleAssignment}', '${bootstrapUserId}', id, 'BOOTSTRAP' FROM roles WHERE code='SYSTEM_ADMIN';
INSERT INTO user_jurisdictions (id, user_id, scope_type, assignment_source)
VALUES ('${resetJurisdictionAssignment}', '${bootstrapUserId}', 'NATIONAL', 'BOOTSTRAP');
DELETE FROM user_totp WHERE user_id='${bootstrapUserId}';
DELETE FROM users WHERE id='${backupAdmin}';
DELETE FROM districts WHERE id IN ('${districtA}', '${districtB}');
DELETE FROM states WHERE id IN ('${stateA}', '${stateB}');
SELECT 1;
`);
assert(dbScalar(`SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id='${bootstrapUserId}' AND r.code='SYSTEM_ADMIN' AND ur.revoked_at IS NULL;`) === "1", "bootstrap role cleanup failed");
assert(dbScalar(`SELECT count(*) FROM user_jurisdictions WHERE user_id='${bootstrapUserId}' AND scope_type='NATIONAL' AND revoked_at IS NULL;`) === "1", "bootstrap jurisdiction cleanup failed");
assert(dbScalar(`SELECT count(*) FROM user_totp WHERE user_id='${bootstrapUserId}';`) === "0", "TOTP cleanup failed");

console.log("[authz] RBAC, jurisdiction ABAC, MFA gating and immediate revocation verification passed");
