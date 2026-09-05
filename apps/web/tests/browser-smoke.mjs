import assert from "node:assert/strict";

const cdpBase = process.env.CDP_HTTP ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";

const targetResponse = await fetch(`${cdpBase}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" });
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send("Page.enable");
await send("Runtime.enable");

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: appUrl });
await delay(3500);

const desktop = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  mobileNav: getComputedStyle(document.querySelector('.nx-mobile-nav')).display,
  sidebar: getComputedStyle(document.querySelector('.nx-sidebar')).display
})`);
assert.equal(desktop.width, 1440, `Desktop viewport override was not applied: ${desktop.width}`);
assert.ok(desktop.heading.includes("trusted verification"), "Expected Phase 2 heading was not rendered");
assert.ok(desktop.scrollWidth <= desktop.width + 1, `Desktop horizontal overflow: ${desktop.scrollWidth} > ${desktop.width}`);
assert.equal(desktop.mobileNav, "none", "Mobile navigation should be hidden at desktop width");
assert.notEqual(desktop.sidebar, "none", "Desktop sidebar should be visible at 1440px");

const clickedDialog = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Open dialog');
  if (!button) return false;
  button.click();
  return true;
})()`);
assert.equal(clickedDialog, true, "Dialog trigger was not found");
await delay(250);
assert.equal(await evaluate("document.querySelector('dialog')?.open ?? false"), true, "Dialog did not open");

await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await delay(250);
assert.equal(await evaluate("document.querySelector('dialog')?.open ?? false"), false, "Dialog did not close with Escape");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.reload", { ignoreCache: true });
await delay(3000);

const mobile = await evaluate(`({
  width: window.innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  mobileNav: getComputedStyle(document.querySelector('.nx-mobile-nav')).display,
  sidebar: getComputedStyle(document.querySelector('.nx-sidebar')).display,
  skipTarget: document.querySelector('.nx-skip-link')?.getAttribute('href')
})`);
assert.equal(mobile.width, 390, `Mobile viewport override was not applied: ${mobile.width}`);
assert.ok(mobile.scrollWidth <= mobile.width + 1, `Mobile horizontal overflow: ${mobile.scrollWidth} > ${mobile.width}`);
assert.notEqual(mobile.mobileNav, "none", "Mobile navigation should be visible at 390px");
assert.equal(mobile.sidebar, "none", "Desktop sidebar should be hidden at 390px");
assert.equal(mobile.skipTarget, "#main-content", "Skip link target changed unexpectedly");

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
  cardWidth: document.querySelector('.nx-auth-card')?.getBoundingClientRect().width ?? 0,
  viewportHeight: window.innerHeight
})`);
assert.equal(loginMobile.width, 390, "Login mobile viewport override was not applied");
assert.ok(loginMobile.scrollWidth <= loginMobile.width + 1, "Login page overflows horizontally on mobile");
assert.ok(loginMobile.cardWidth > 280 && loginMobile.cardWidth <= 390, `Login card width is invalid: ${loginMobile.cardWidth}`);

console.log("Browser smoke passed", { desktop, mobile, loginDesktop, loginMobile });
socket.close();
