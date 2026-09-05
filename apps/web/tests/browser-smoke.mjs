import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const cdpBase = process.env.CDP_HTTP ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const bootstrapEmail = process.env.BOOTSTRAP_USER_EMAIL ?? "local.operator@nirikshanx.test";
const bootstrapPassword = process.env.BOOTSTRAP_USER_PASSWORD ?? "Local-NX-2026-Change!";
const screenshotDir = process.env.UI_SCREENSHOT_DIR ?? "/tmp/nirikshanx-ui";

await mkdir(screenshotDir, { recursive: true });

const targetResponse = await fetch(`${cdpBase}/json/new?${encodeURIComponent(`${appUrl}/login`)}`, { method: "PUT" });
assert.equal(targetResponse.ok, true, `CDP target creation failed: ${targetResponse.status}`);
const target = await targetResponse.json();
assert.ok(target.webSocketDebuggerUrl, "CDP target did not expose a WebSocket URL");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed");
  return result.result.value;
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(`${screenshotDir}/${name}`, Buffer.from(result.data, "base64"));
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `${appUrl}/login` });
await delay(2500);

const loginDesktop = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  emailType: document.querySelector('#email')?.getAttribute('type') ?? '',
  passwordType: document.querySelector('#password')?.getAttribute('type') ?? '',
  submitText: document.querySelector('button[type="submit"]')?.textContent?.trim() ?? '',
  mainId: document.querySelector('main')?.id ?? ''
})`);
assert.ok(loginDesktop.heading.includes("Sign in to NirikshanX"), "Login heading was not rendered");
assert.equal(loginDesktop.emailType, "email", "Login email field contract changed");
assert.equal(loginDesktop.passwordType, "password", "Login password field contract changed");
assert.equal(loginDesktop.submitText, "Sign in", "Login primary action was not rendered");
assert.equal(loginDesktop.mainId, "main-content", "Login main landmark changed unexpectedly");
assert.ok(loginDesktop.scrollWidth <= loginDesktop.width + 1, "Login page overflows horizontally on desktop");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.reload", { ignoreCache: true });
await delay(2200);
const loginMobile = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  cardWidth: document.querySelector('.nx-auth-card')?.getBoundingClientRect().width ?? 0
})`);
assert.equal(loginMobile.width, 390, "Login mobile viewport override was not applied");
assert.ok(loginMobile.scrollWidth <= loginMobile.width + 1, "Login page overflows horizontally on mobile");
assert.ok(loginMobile.cardWidth > 280 && loginMobile.cardWidth <= 390, `Login card width is invalid: ${loginMobile.cardWidth}`);
await screenshot("login-mobile-390x844.png");

// Authenticate through the real same-origin login endpoint. The response sets the
// HttpOnly refresh cookie. Navigating to / then exercises the normal AuthProvider
// refresh path instead of injecting an access token into browser storage.
const loginResult = await evaluate(`fetch('/backend-api/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ email: ${JSON.stringify(bootstrapEmail)}, password: ${JSON.stringify(bootstrapPassword)} })
}).then(async (response) => ({ status: response.status, body: await response.json() }))`);
assert.equal(loginResult.status, 200, `Bootstrap browser login failed: ${JSON.stringify(loginResult.body)}`);
assert.equal(loginResult.body.status, "AUTHENTICATED", "Fresh bootstrap login should establish a password-only session before TOTP enrollment");

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: appUrl });
await delay(4000);

const desktop = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  mobileNav: document.querySelector('.nx-workspace-mobile-nav') ? getComputedStyle(document.querySelector('.nx-workspace-mobile-nav')).display : 'missing',
  sidebar: document.querySelector('.nx-workspace-sidebar') ? getComputedStyle(document.querySelector('.nx-workspace-sidebar')).display : 'missing',
  skipTarget: document.querySelector('.nx-skip-link')?.getAttribute('href') ?? '',
  policy: document.querySelector('.nx-workspace-policy')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  links: [...document.querySelectorAll('.nx-workspace-nav a')].map((node) => node.getAttribute('href')),
  url: location.pathname
})`);
assert.equal(desktop.width, 1440, `Desktop viewport override was not applied: ${desktop.width}`);
assert.equal(desktop.url, "/", `Authenticated session did not land on workspace: ${desktop.url}`);
assert.ok(desktop.heading.includes("System Administration"), `Expected System Administration workspace, got: ${desktop.heading}`);
assert.ok(desktop.scrollWidth <= desktop.width + 1, `Desktop horizontal overflow: ${desktop.scrollWidth} > ${desktop.width}`);
assert.equal(desktop.mobileNav, "none", "Mobile workspace navigation should be hidden at desktop width");
assert.notEqual(desktop.sidebar, "none", "Workspace sidebar should be visible at 1440px");
assert.equal(desktop.skipTarget, "#main-content", "Workspace skip link target changed unexpectedly");
assert.match(desktop.policy, /MFA required/i, "Password-only privileged session must be visibly restricted");
assert.deepEqual(desktop.links, ["/", "/account"], "Withheld privileges must not leak institution/program navigation into password-only bootstrap session");
await screenshot("desktop-1440x1200.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.reload", { ignoreCache: true });
await delay(3200);

const mobile = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  mobileNav: document.querySelector('.nx-workspace-mobile-nav') ? getComputedStyle(document.querySelector('.nx-workspace-mobile-nav')).display : 'missing',
  sidebar: document.querySelector('.nx-workspace-sidebar') ? getComputedStyle(document.querySelector('.nx-workspace-sidebar')).display : 'missing',
  navLinks: [...document.querySelectorAll('.nx-workspace-mobile-nav a')].map((node) => node.getAttribute('href'))
})`);
assert.equal(mobile.width, 390, `Mobile viewport override was not applied: ${mobile.width}`);
assert.ok(mobile.heading.includes("System Administration"), "Role-aware workspace heading disappeared on mobile");
assert.ok(mobile.scrollWidth <= mobile.width + 1, `Mobile horizontal overflow: ${mobile.scrollWidth} > ${mobile.width}`);
assert.notEqual(mobile.mobileNav, "none", "Mobile workspace navigation should be visible at 390px");
assert.equal(mobile.sidebar, "none", "Desktop workspace sidebar should be hidden at 390px");
assert.deepEqual(mobile.navLinks, ["/", "/account"], "Mobile navigation must use the same effective-permission boundary");
await screenshot("mobile-390x844.png");

console.log("Browser smoke passed", { loginDesktop, loginMobile, desktop, mobile });
socket.close();
