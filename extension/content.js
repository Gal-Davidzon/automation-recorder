const SENSITIVE = /password|passcode|otp|token|secret|credit.?card|cvv|ssn/i;
const EVENTS = ["pointerdown", "pointerup", "click", "dblclick", "input", "change", "copy", "paste", "submit", "focusin", "keydown"];
let status = { recording: false, captureScreenshots: false };

for (const type of EVENTS) document.addEventListener(type, captureEvent, true);
chrome.runtime.sendMessage({ type: "get-status" }, (nextStatus) => { status = nextStatus ?? status; });
chrome.runtime.onMessage.addListener((message) => { if (message.type === "recorder-status") status = message.status; });

function captureEvent(event) {
  if (!status.recording) return;
  if (!(event.target instanceof Element)) return;
  if (typeIsPrintableKey(event) || event.target.closest("[data-automation-recorder-ignore]")) return;
  const target = describeTarget(event.target);
  const clipboard = event.type === "copy" || event.type === "paste"
    ? { operation: event.type, redacted: true }
    : undefined;
  const auditEvent = {
    type: event.type,
    timestamp: new Date().toISOString(),
    page: { url: sanitizedUrl(location.href) },
    target,
    clipboard,
    screenshot: status.captureScreenshots && ["click", "submit"].includes(event.type) && !target.sensitive && !hasSensitiveViewport() ? { required: true } : undefined,
  };
  chrome.runtime.sendMessage({ type: "record-event", event: auditEvent });
}

function describeTarget(element) {
  const rect = element.getBoundingClientRect();
  const text = ["BUTTON", "A"].includes(element.tagName) ? element.textContent?.trim().slice(0, 160) : undefined;
  const name = safeName(element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("name") || element.id || text || element.tagName.toLowerCase());
  const type = element.getAttribute("type") || undefined;
  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || implicitRole(element),
    name,
    type,
    sensitive: type === "password" || SENSITIVE.test(`${name} ${element.getAttribute("autocomplete") ?? ""}`),
    locator: compact({ testId: element.getAttribute("data-testid") || undefined, id: element.id || undefined, name: element.getAttribute("name") || undefined, css: cssPath(element) }),
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
  };
}

function implicitRole(element) {
  if (element.tagName === "BUTTON") return "button";
  if (element.tagName === "A") return "link";
  if (element.tagName === "INPUT") return inputRole(element.getAttribute("type"));
  return undefined;
}
function cssPath(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  return element.tagName.toLowerCase() + (element.getAttribute("name") ? `[name="${CSS.escape(element.getAttribute("name"))}"]` : "");
}
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
function typeIsPrintableKey(event) { return event.type === "keydown" && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey; }
function inputRole(type = "text") {
  if (["checkbox"].includes(type)) return "checkbox";
  if (["radio"].includes(type)) return "radio";
  if (["button", "submit", "reset", "image"].includes(type)) return "button";
  if (["range"].includes(type)) return "slider";
  return "textbox";
}
function hasSensitiveViewport() { return Boolean(document.querySelector('input[type="password"], input[autocomplete*="cc-"], [data-automation-recorder-sensitive]')); }
function sanitizedUrl(value) { const url = new URL(value); return `${url.protocol}//${url.host}${url.pathname}`; }
function safeName(value) { const name = String(value).replaceAll(/\s+/g, " ").trim().slice(0, 160); return SENSITIVE.test(name) ? "[redacted sensitive target]" : name; }
