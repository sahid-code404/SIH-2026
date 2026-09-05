import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

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
];

test("inspection template navigation is capability-driven", async () => {
  const model = await source("lib/workspace-model.ts");
  assert.match(model, /permissions\.has\("inspection\.read"\)/);
  assert.match(model, /href:\s*"\/inspection-templates"/);
  assert.match(model, /label:\s*"Templates"/);
});

test("template builder exposes every specification question type without hardcoded questionnaire text", async () => {
  const detail = await source("app/inspection-templates/[templateId]/page.tsx");
  for (const type of QUESTION_TYPES) assert.match(detail, new RegExp(`"${type}"`));
  assert.match(detail, /SINGLE_SELECT/);
  assert.match(detail, /MULTI_SELECT/);
  assert.match(detail, /evidenceRequirements/);
  assert.match(detail, /sourceQuestionCode/);
  assert.match(detail, /targetQuestionCode/);
  assert.doesNotMatch(detail, /fire extinguisher available/i);
});

test("template screens use live auth context and server APIs", async () => {
  const catalog = await source("app/inspection-templates/page.tsx");
  const detail = await source("app/inspection-templates/[templateId]/page.tsx");
  assert.match(catalog, /authorization\?\.effectivePermissions/);
  assert.match(catalog, /inspection\.read/);
  assert.match(catalog, /inspection\.create/);
  assert.match(catalog, /\/api\/v1\/inspection-templates/);
  assert.match(detail, /\/api\/v1\/inspection-templates/);
  assert.doesNotMatch(`${catalog}\n${detail}`, /localStorage|sessionStorage/);
});

test("template styles are loaded by the authenticated application shell", async () => {
  const layout = await source("app/layout.tsx");
  assert.match(layout, /inspection-templates\.css/);
});
