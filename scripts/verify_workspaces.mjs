import assert from "node:assert/strict";

const baseUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";
const email = process.env.BOOTSTRAP_USER_EMAIL ?? "local.operator@nirikshanx.test";
const password = process.env.BOOTSTRAP_USER_PASSWORD ?? "Local-NX-2026-Change!";

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function request(method, path, { bearer, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await json(response) };
}

function expectStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: expected ${expected}, got ${response.status}: ${JSON.stringify(response.json)}`);
}

console.log("[workspace] establishing fresh password-only bootstrap session");
let response = await request("POST", "/api/v1/auth/login", { body: { email, password } });
expectStatus(response, 200, "bootstrap login");
assert.equal(response.json?.status, "AUTHENTICATED", "Fresh bootstrap account should authenticate before TOTP enrollment");
assert.ok(response.json?.accessToken, "Login did not return an access token");
const access = response.json.accessToken;

console.log("[workspace] reading live authorization context used by the web workspace resolver");
response = await request("GET", "/api/v1/authz/me", { bearer: access });
expectStatus(response, 200, "authorization context");
const context = response.json;
assert.ok(Array.isArray(context?.roles), "Authorization context must include roles");
assert.ok(Array.isArray(context?.effectivePermissions), "Authorization context must include effectivePermissions");
assert.ok(Array.isArray(context?.withheldPermissions), "Authorization context must include withheldPermissions");
assert.ok(Array.isArray(context?.jurisdictions), "Authorization context must include jurisdictions");

const systemAdmin = context.roles.find((role) => role.code === "SYSTEM_ADMIN");
assert.ok(systemAdmin, "Bootstrap context must include SYSTEM_ADMIN for deterministic system workspace resolution");
assert.equal(systemAdmin.mfaRequired, true, "SYSTEM_ADMIN must remain MFA-protected");
assert.ok(
  context.jurisdictions.some((scope) => scope.scopeType === "NATIONAL"),
  "Bootstrap context must include NATIONAL jurisdiction",
);

assert.equal(context.mfaRequired, true, "Bootstrap authorization context should require MFA");
assert.equal(context.mfaEnabled, false, "Workspace verifier expects the clean pre-authentication-verifier bootstrap state without TOTP");
assert.equal(context.sessionMfaVerified, false, "Password-only bootstrap session must not have MFA assurance");
assert.equal(context.mfaSatisfied, false, "Password-only bootstrap session must not satisfy privileged MFA policy");
assert.equal(context.effectivePermissions.length, 0, "MFA-required bootstrap permissions must be withheld from a password-only session");
assert.ok(context.withheldPermissions.includes("authorization.manage"), "authorization.manage must be visibly withheld before MFA");
assert.ok(context.withheldPermissions.includes("institution.read"), "institution.read must be visibly withheld before MFA");
assert.ok(context.withheldPermissions.includes("scheme.read"), "scheme.read must be visibly withheld before MFA");
assert.ok(context.withheldPermissions.includes("project.read"), "project.read must be visibly withheld before MFA");

console.log("[workspace] proving withheld capabilities remain unavailable at the backend boundary");
response = await request("GET", "/api/v1/institutions?page=0&size=1", { bearer: access });
expectStatus(response, 403, "MFA-withheld institution registry");
response = await request("GET", "/api/v1/schemes?page=0&size=1", { bearer: access });
expectStatus(response, 403, "MFA-withheld scheme registry");

console.log("[workspace] revoking verifier session");
response = await request("POST", "/api/v1/auth/logout", { bearer: access });
expectStatus(response, 204, "workspace verifier logout");

console.log("Workspace authorization-input verification passed");
