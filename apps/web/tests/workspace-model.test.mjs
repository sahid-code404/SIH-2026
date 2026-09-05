import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("workspace resolver covers every system role with deterministic precedence", async () => {
  const model = await source("lib/workspace-model.ts");
  const roles = [
    "SYSTEM_ADMIN",
    "MINISTRY_ADMIN",
    "MINISTRY_OFFICER",
    "STATE_OFFICER",
    "DISTRICT_OFFICER",
    "INSPECTION_SUPERVISOR",
    "AUDITOR",
    "INSTITUTION_ADMIN",
    "INSTITUTION_OPERATOR",
    "INSPECTOR",
  ];
  for (const role of roles) assert.match(model, new RegExp(`\\b${role}\\b`));

  const precedence = model.match(/WORKSPACE_ROLE_PRECEDENCE\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? "";
  let previous = -1;
  for (const role of roles) {
    const index = precedence.indexOf(`"${role}"`);
    assert.ok(index > previous, `${role} is missing or out of workspace precedence order`);
    previous = index;
  }
});

test("navigation is capability-driven and only points to implemented product routes", async () => {
  const model = await source("lib/workspace-model.ts");
  assert.match(model, /permissions\.has\("institution\.read"\)/);
  assert.match(model, /permissions\.has\("scheme\.read"\)/);
  assert.match(model, /permissions\.has\("enrollment\.read"\)/);
  assert.match(model, /permissions\.has\("project\.read"\)/);
  assert.match(model, /permissions\.has\("milestone\.read"\)/);
  for (const route of ['href: "/"', 'href: "/institutions"', 'href: "/programs"', 'href: "/account"']) {
    assert.match(model, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(model, /href:\s*"\/(inspections|risk|cctv|attendance|corrective-actions)/);
});

test("workspace selection explicitly remains presentation-only and preserves MFA withholding", async () => {
  const model = await source("lib/workspace-model.ts");
  const shell = await source("components/role-aware-shell.tsx");
  assert.match(model, /Presentation-only precedence/);
  assert.match(model, /mfaRequired\s*&&\s*!context\.mfaSatisfied/);
  assert.match(shell, /privileged permissions are withheld until a fresh MFA sign-in/);
  assert.doesNotMatch(shell, /ROLE_/);
});
