import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("semantic token contract includes required surface, status and risk tokens", async () => {
  const css = await source("app/globals.css");
  const required = [
    "--nx-background",
    "--nx-surface",
    "--nx-surface-muted",
    "--nx-surface-elevated",
    "--nx-border",
    "--nx-border-strong",
    "--nx-text-primary",
    "--nx-text-secondary",
    "--nx-text-muted",
    "--nx-primary",
    "--nx-primary-hover",
    "--nx-success",
    "--nx-warning",
    "--nx-danger",
    "--nx-info",
    "--nx-risk-low",
    "--nx-risk-medium",
    "--nx-risk-high",
    "--nx-risk-critical",
  ];

  for (const token of required) assert.match(css, new RegExp(token.replaceAll("-", "\\-")));
});

test("reduced-motion and visible-focus contracts are present", async () => {
  const css = await source("app/globals.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("application shell keeps skip navigation and does not embed SiteProof role checks", async () => {
  const shell = await source("components/app-shell.tsx");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /aria-label="Primary"/);
  assert.doesNotMatch(shell, /role\s*===/);
  assert.doesNotMatch(shell, /localStorage/);
});

test("sections have real aria-labelledby targets", async () => {
  const page = await source("app/page.tsx");
  const primitives = await source("components/ui/primitives.tsx");
  for (const id of ["system-heading", "components-heading", "patterns-heading", "tokens-heading"]) {
    assert.match(page, new RegExp(`aria-labelledby="${id}"`));
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(primitives, /<h2 id=\{id\}>/);
});

test("modal overlays use native dialog behavior and explicit cancellation", async () => {
  const overlays = await source("components/ui/overlays.tsx");
  assert.match(overlays, /<dialog/);
  assert.match(overlays, /showModal\(\)/);
  assert.match(overlays, /onCancel=/);
  assert.match(overlays, /aria-labelledby=/);
});

test("live status remains backed by the real same-origin system endpoint", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /\/backend-api\/api\/v1\/system\/status/);
  assert.doesNotMatch(page, /fake risk|fake inspection|fake AI/i);
});
