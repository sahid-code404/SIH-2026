import { createHash, createHmac } from "node:crypto";
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
const email = process.env.AUTH_TEST_EMAIL ?? envFileValue("BOOTSTRAP_USER_EMAIL", "local.operator@nirikshanx.test");
const originalPassword = process.env.AUTH_TEST_PASSWORD ?? envFileValue("BOOTSTRAP_USER_PASSWORD", "Local-NX-2026-Change!");
const newPassword = process.env.AUTH_TEST_NEW_PASSWORD ?? "NX-Auth-Verified-2026!";
const rateLimitEmail = "rate-limit-probe@nirikshanx.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbScalar(sql) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", dbUser, "-d", dbName, "-tA"],
    { input: `${sql}\n`, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`database verification failed: ${result.stderr || "psql exited non-zero"}`);
  }
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

async function api(method, path, { body, bearer, refresh } = {}) {
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": `auth-ci-${Date.now()}-${Math.random()}` });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (refresh) headers.set("Cookie", `nirikshanx_refresh=${refresh}`);

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
  return { status: response.status, headers: response.headers, text, json };
}

function expectStatus(response, expected, context) {
  if (response.status !== expected) {
    const safeBody = response.status >= 400 ? ` body=${response.text.slice(0, 600)}` : "";
    throw new Error(`${context}: HTTP ${response.status}, expected ${expected}.${safeBody}`);
  }
}

function refreshCookie(response) {
  const setCookie = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie().join(",")
    : response.headers.get("set-cookie") ?? "";
  const match = /(?:^|[,\s])nirikshanx_refresh=([^;]+)/.exec(setCookie);
  return { value: match?.[1] ?? "", raw: setCookie };
}

function jwtPayload(token) {
  const parts = token.split(".");
  assert(parts.length === 3, "access token is not a compact JWT");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function assertJwtContract(token) {
  const payload = jwtPayload(token);
  const actual = Object.keys(payload).sort();
  const expected = ["aud", "exp", "iat", "iss", "jti", "sid", "sub"].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `unexpected JWT claims: ${actual.join(",")}`);
  assert(payload.iss === "nirikshanx", "JWT issuer is incorrect");
  assert(payload.aud === "nirikshanx-web", "JWT audience is incorrect");
  assert(Number.isInteger(payload.iat) && Number.isInteger(payload.exp) && payload.exp > payload.iat, "JWT timestamps are invalid");
  const ttl = payload.exp - payload.iat;
  assert(ttl >= 590 && ttl <= 610, `unexpected access-token TTL: ${ttl}`);
  assert(payload.sub && payload.sid && payload.jti, "JWT identity/session identifiers are missing");
  return payload;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
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

console.log("[auth] Flyway V3, bootstrap user and Argon2id");
assert(dbScalar("SELECT count(*) FROM flyway_schema_history WHERE version='3' AND success=true;") === "1", "Flyway V3 is not successful");
assert(dbScalar(`SELECT count(*) FROM users WHERE email='${email}' AND status='ACTIVE';`) === "1", "bootstrap user is missing/inactive");
assert(dbScalar(`SELECT count(*) FROM users WHERE email='${email}' AND substring(password_hash from 1 for 10)='$argon2id$';`) === "1", "password hash is not Argon2id");

console.log("[auth] password login, HttpOnly refresh cookie and compact access JWT");
let response = await api("POST", "/api/v1/auth/login", { body: { email, password: originalPassword } });
expectStatus(response, 200, "password login");
assert(response.json?.status === "AUTHENTICATED", "password login did not authenticate");
const accessOne = response.json.accessToken;
const firstCookie = refreshCookie(response);
assert(firstCookie.value, "refresh cookie was not returned");
assert(/httponly/i.test(firstCookie.raw), "refresh cookie is not HttpOnly");
assert(/samesite=strict/i.test(firstCookie.raw), "refresh cookie is not SameSite=Strict");
assertJwtContract(accessOne);

response = await api("GET", "/api/v1/auth/me", { bearer: accessOne });
expectStatus(response, 200, "authenticated /me");
assert(response.json?.email === email, "/me returned the wrong user");

response = await api("GET", "/api/v1/auth/sessions", { bearer: accessOne });
expectStatus(response, 200, "session list");
assert(response.json.filter((session) => session.current).length === 1, "current session is not represented exactly once");

console.log("[auth] hash-only refresh storage, rotation and family revocation on replay");
assert(dbScalar(`SELECT count(*) FROM user_refresh_tokens WHERE token_hash='${firstCookie.value}';`) === "0", "raw refresh token is stored in PostgreSQL");
assert(dbScalar(`SELECT count(*) FROM user_refresh_tokens WHERE token_hash='${sha256(firstCookie.value)}';`) === "1", "refresh-token hash is missing");

response = await api("POST", "/api/v1/auth/refresh", { refresh: firstCookie.value });
expectStatus(response, 200, "refresh rotation");
const accessRotated = response.json.accessToken;
const rotatedCookie = refreshCookie(response);
assert(rotatedCookie.value && rotatedCookie.value !== firstCookie.value, "refresh token did not rotate");

response = await api("POST", "/api/v1/auth/refresh", { refresh: firstCookie.value });
expectStatus(response, 401, "consumed refresh replay");
assert(response.json?.type === "REFRESH_REUSE_DETECTED", "refresh replay did not return the reuse error");
assert(response.json?.requestId, "auth error omitted requestId");
response = await api("GET", "/api/v1/auth/me", { bearer: accessRotated });
expectStatus(response, 401, "access after refresh-family revocation");
assert(Number(dbScalar("SELECT count(*) FROM authentication_events WHERE outcome='REFRESH_REUSE';")) >= 1, "refresh-reuse audit event rolled back");

console.log("[auth] password change, old-password rejection and disabled-account protection");
response = await api("POST", "/api/v1/auth/login", { body: { email, password: originalPassword } });
expectStatus(response, 200, "second password login");
const accessPasswordChange = response.json.accessToken;
response = await api("POST", "/api/v1/auth/password/change", {
  bearer: accessPasswordChange,
  body: { currentPassword: originalPassword, newPassword },
});
expectStatus(response, 204, "password change");
response = await api("POST", "/api/v1/auth/login", { body: { email, password: originalPassword } });
expectStatus(response, 401, "old password after change");
response = await api("POST", "/api/v1/auth/login", { body: { email, password: newPassword } });
expectStatus(response, 200, "new password login");
const accessNewPassword = response.json.accessToken;
const sessionNewPassword = assertJwtContract(accessNewPassword).sid;

dbScalar(`UPDATE users SET status='DISABLED' WHERE email='${email}'; SELECT count(*) FROM users WHERE email='${email}' AND status='DISABLED';`);
response = await api("POST", "/api/v1/auth/login", { body: { email, password: newPassword } });
expectStatus(response, 401, "disabled account login");
dbScalar(`UPDATE users SET status='ACTIVE' WHERE email='${email}'; SELECT 1;`);

console.log("[auth] TOTP enrollment, second-factor login and replay resistance");
response = await api("POST", "/api/v1/auth/mfa/totp/enroll", { bearer: accessNewPassword });
expectStatus(response, 200, "TOTP enrollment");
const totpSecret = response.json?.secret;
assert(totpSecret, "TOTP secret is missing");
response = await api("POST", "/api/v1/auth/mfa/totp/confirm", { bearer: accessNewPassword, body: { code: totp(totpSecret, 0) } });
expectStatus(response, 204, "TOTP confirmation");

response = await api("POST", "/api/v1/auth/login", { body: { email, password: newPassword } });
expectStatus(response, 200, "MFA password stage");
assert(response.json?.status === "MFA_REQUIRED", "enabled MFA did not require a second factor");
const challengeOne = response.json.mfaChallengeToken;
const nextCode = totp(totpSecret, 1);
response = await api("POST", "/api/v1/auth/mfa/login/verify", { body: { challengeToken: challengeOne, code: nextCode } });
expectStatus(response, 200, "MFA verification");
const accessMfa = response.json.accessToken;
assert(response.json.user?.mfaEnabled === true, "MFA-enabled identity was not returned");

response = await api("POST", "/api/v1/auth/login", { body: { email, password: newPassword } });
expectStatus(response, 200, "second MFA password stage");
const challengeTwo = response.json.mfaChallengeToken;
response = await api("POST", "/api/v1/auth/mfa/login/verify", { body: { challengeToken: challengeTwo, code: nextCode } });
expectStatus(response, 401, "TOTP replay");
assert(response.json?.type === "INVALID_MFA_CODE", "replayed TOTP was not rejected");
assert(Number(dbScalar("SELECT count(*) FROM authentication_events WHERE outcome='MFA_FAILED';")) >= 1, "MFA failure audit event rolled back");

console.log("[auth] targeted session revocation and logout-all");
response = await api("GET", "/api/v1/auth/sessions", { bearer: accessMfa });
expectStatus(response, 200, "MFA session list");
assert(response.json.length >= 2, "multiple active sessions were expected for revocation verification");
response = await api("DELETE", `/api/v1/auth/sessions/${sessionNewPassword}`, { bearer: accessMfa });
expectStatus(response, 204, "targeted session revocation");
response = await api("GET", "/api/v1/auth/me", { bearer: accessNewPassword });
expectStatus(response, 401, "revoked-session access");
response = await api("POST", "/api/v1/auth/logout-all", { bearer: accessMfa });
expectStatus(response, 204, "logout-all");
response = await api("GET", "/api/v1/auth/me", { bearer: accessMfa });
expectStatus(response, 401, "access after logout-all");

console.log("[auth] persisted failed-login rate limiting");
for (let attempt = 1; attempt <= 5; attempt += 1) {
  response = await api("POST", "/api/v1/auth/login", { body: { email: rateLimitEmail, password: "Wrong-Password-For-Rate-Limit!" } });
  expectStatus(response, 401, `rate-limit warm-up ${attempt}`);
}
response = await api("POST", "/api/v1/auth/login", { body: { email: rateLimitEmail, password: "Wrong-Password-For-Rate-Limit!" } });
expectStatus(response, 429, "rate-limit threshold");
assert(response.json?.type === "LOGIN_RATE_LIMITED", "rate-limit response type is incorrect");
assert(Number(dbScalar("SELECT count(*) FROM authentication_events WHERE outcome='RATE_LIMITED';")) >= 1, "rate-limit audit event rolled back");

console.log("[auth] authentication and session-security verification passed");
