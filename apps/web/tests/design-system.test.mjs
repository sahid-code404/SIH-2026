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
  const globals = await source("app/globals.css");
  const workspace = await source("app/workspace.css");
  assert.match(globals, /:focus-visible/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce/);
  assert.match(workspace, /prefers-reduced-motion:\s*reduce/);
});

test("authenticated product shell keeps skip navigation and avoids client storage authorization", async () => {
  const shell = await source("components/role-aware-shell.tsx");
  const provider = await source("components/workspace-provider.tsx");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /aria-label="Primary"/);
  assert.match(shell, /nx-workspace-mobile-nav/);
  assert.match(provider, /\/api\/v1\/authz\/me/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage/);
  assert.doesNotMatch(provider, /localStorage|sessionStorage/);
});

test("design-system overlays retain native dialog behavior and explicit cancellation", async () => {
  const overlays = await source("components/ui/overlays.tsx");
  assert.match(overlays, /<dialog/);
  assert.match(overlays, /showModal\(\)/);
  assert.match(overlays, /onCancel=/);
  assert.match(overlays, /aria-labelledby=/);
});

test("workspace home uses real implemented APIs and contains no fabricated monitoring metrics", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /\/api\/v1\/institutions/);
  assert.match(page, /\/api\/v1\/schemes/);
  assert.match(page, /\/api\/v1\/projects/);
  assert.doesNotMatch(page, /mock risk|fake risk|fake inspection|fake AI|sample anomaly/i);
  assert.match(page, /intentionally absent until their dedicated roadmap phases/);
});
