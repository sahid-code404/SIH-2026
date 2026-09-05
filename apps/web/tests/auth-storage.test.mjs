import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile(new URL("../components/auth-provider.tsx", import.meta.url), "utf8");
const login = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const account = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");

test("access credentials are not persisted in browser storage", () => {
  for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.equal(provider.includes(forbidden), false, `auth provider must not use ${forbidden}`);
  }
  assert.match(provider, /tokenRef\.current/);
});

test("login supports a second-factor challenge", () => {
  assert.match(login, /MFA_REQUIRED|mfaRequired|Verify your identity/);
  assert.match(login, /one-time-code/);
});

test("account security surface exposes real session and MFA operations", () => {
  assert.match(account, /\/api\/v1\/auth\/sessions/);
  assert.match(account, /\/api\/v1\/auth\/mfa\/totp\/enroll/);
  assert.match(account, /\/api\/v1\/auth\/password\/change/);
});
