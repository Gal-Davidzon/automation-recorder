const SENSITIVE_FIELD = /password|passcode|otp|token|secret|credit.?card|cvv|ssn/i;
const AUTH_PROVIDER = /(google|microsoft|apple|okta|github|auth0)/i;

export function redactClipboard(text, { captureContent = false } = {}) {
  const value = String(text ?? "");
  return captureContent ? { redacted: false, length: value.length, text: value } : { redacted: true, length: value.length };
}

export function toBrowserAuditStep(event, { captureClipboardContent = false } = {}) {
  const target = event.target ?? {};
  const auth = classifyAuthentication(event, target);
  const screenshotAllowed = !isSensitiveTarget(target) && ["click", "dblclick", "submit"].includes(event.type);
  const clipboard = event.clipboard
    ? normalizeClipboard(event.clipboard, captureClipboardContent)
    : undefined;

  return compact({
    id: event.id ?? `browser-${event.timestamp ?? Date.now()}`,
    kind: event.type,
    target: {
      app: sanitizePage(event.page)?.url ? new URL(sanitizePage(event.page).url).host : undefined,
      role: target.role ?? target.tag,
      label: sanitizeLabel(target.name ?? target.label ?? target.text ?? target.tag ?? "Unlabeled element"),
      locator: target.locator,
      bounds: target.bounds,
    },
    audit: compact({
      timestamp: event.timestamp,
      page: sanitizePage(event.page),
      locator: target.locator,
      bounds: target.bounds,
      clipboard,
      auth,
      screenshot: event.screenshot?.id ? { id: event.screenshot.id } : screenshotAllowed ? { required: true } : undefined,
      sensitive: isSensitiveTarget(target) || undefined,
    }),
  });
}

export function buildAuditDocument(recording) {
  const steps = recording.steps ?? [];
  const rows = steps.map((step, index) => {
    const audit = step.audit ?? {};
    const target = step.target?.label ?? "Unlabeled element";
    const evidence = [
      audit.screenshot?.id ? `screenshot:${audit.screenshot.id}` : audit.screenshot?.required ? "screenshot requested" : null,
      audit.clipboard ? `${audit.clipboard.operation} clipboard (${audit.clipboard.redacted ? "redacted" : "captured"}, ${audit.clipboard.length} chars)` : null,
      audit.auth ? `${audit.auth.method}${audit.auth.provider ? ` via ${audit.auth.provider}` : ""}` : null,
    ].filter(Boolean).join("; ") || "—";
    return `| ${index + 1} | ${escapeCell(step.kind)} | ${escapeCell(target)} | ${escapeCell(evidence)} |`;
  });
  const flow = steps.map((step, index) => `  S${index + 1}["${escapeMermaid(step.target?.label ?? step.kind)}"]`).join("\n")
    + steps.slice(1).map((_, index) => `\n  S${index + 1} --> S${index + 2}`).join("");

  return `# Workflow audit: ${recording.id ?? "untitled"}

## Purpose

This is an editable execution specification generated from a browser recording. Review every locator, screenshot, condition, and authentication marker before enabling replay.

## Flow

\`\`\`mermaid
flowchart TD
${flow || "  Empty[No captured steps]"}
\`\`\`

## Action ledger

| # | Event | Target | Audit evidence |
| --- | --- | --- | --- |
${rows.join("\n") || "| — | — | No actions captured | — |"}

## Authentication and data handling

- Authentication is recorded as a method/provider marker only; passwords, passkeys, tokens, session cookies, and OAuth assertions are never captured.
- Clipboard content is redacted by default. Enable content capture only for a deliberately approved, non-sensitive workflow.
- Screenshot capture is suppressed for password and other sensitive controls.

## Editable automation rules

- Prefer stable data-testid, role/name, and URL locators. Treat coordinate bounds as visual evidence and a last-resort fallback.
- Add a precondition, wait, retry policy, or human approval before a step when the page state can vary.
- An LLM may propose branches, data extraction rules, or fallback locators; a human must approve each proposal before replay.
`;
}

export function buildLLMReviewRequest(workflow) {
  const safeWorkflow = structuredClone(workflow);
  for (const step of safeWorkflow.steps ?? []) {
    if (step.audit?.page) step.audit.page = sanitizePage(step.audit.page);
    if (step.target?.label) step.target.label = sanitizeLabel(step.target.label);
    if (step.audit?.clipboard) {
      const { length = 0, operation } = step.audit.clipboard;
      step.audit.clipboard = { operation, redacted: true, length };
    }
    if (step.audit?.auth) step.audit.auth.credentialsCaptured = false;
  }
  return {
    instructions: "Please propose, but do not execute, robust branches, waits, extraction rules, fallback locators, and human-approval gates for this redacted browser workflow. Return each suggestion with evidence and confidence. Never request credentials, cookies, tokens, or raw clipboard text.",
    workflow: safeWorkflow,
  };
}

function normalizeClipboard(clipboard, captureContent) {
  if (clipboard.text !== undefined) {
    return { operation: clipboard.operation, ...redactClipboard(clipboard.text, { captureContent }) };
  }
  return { operation: clipboard.operation, redacted: true, ...(clipboard.length === undefined ? {} : { length: clipboard.length }) };
}

export function sanitizePage(page) {
  if (!page?.url) return undefined;
  try {
    const url = new URL(page.url);
    return { url: `${url.protocol}//${url.host}${url.pathname}` };
  } catch {
    return { url: "invalid-url" };
  }
}

function sanitizeLabel(value) {
  const label = String(value).replaceAll(/\s+/g, " ").trim().slice(0, 160);
  return SENSITIVE_FIELD.test(label) ? "[redacted sensitive target]" : label;
}

function classifyAuthentication(event, target) {
  const text = `${target.name ?? ""} ${target.label ?? ""} ${target.type ?? ""}`;
  if (target.type === "password" || SENSITIVE_FIELD.test(text)) {
    return { method: "password-form", credentialsCaptured: false };
  }
  const provider = text.match(AUTH_PROVIDER)?.[1];
  if (provider) return { method: "oauth", provider: capitalize(provider), credentialsCaptured: false };
  if (/passkey|webauthn/i.test(text)) return { method: "passkey", credentialsCaptured: false };
  return event.type === "auth" ? { method: "unknown", credentialsCaptured: false } : undefined;
}

function isSensitiveTarget(target) {
  return target.type === "password" || target.sensitive === true || SENSITIVE_FIELD.test(`${target.name ?? ""} ${target.label ?? ""}`);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeMermaid(value) {
  return String(value).replaceAll('"', "'").replaceAll("[", "(").replaceAll("]", ")");
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}
