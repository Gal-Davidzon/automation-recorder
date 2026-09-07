import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeRecordings,
  captureRecording,
  createWorkflow,
  replayWorkflow,
} from "../src/index.js";
import { buildAuditDocument, buildLLMReviewRequest, redactClipboard, toBrowserAuditStep } from "../src/browser.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDashboard } from "../src/dashboard-server.js";

const steps = (labels) =>
  labels.map((label, index) => ({
    id: `s${index + 1}`,
    kind: "click",
    target: { app: "crm", role: "button", label },
  }));

test("finds a repeated block across recordings", () => {
  const report = analyzeRecordings([
    { id: "invoice-1", steps: steps(["Open invoice", "Approve", "Send receipt"]) },
    { id: "invoice-2", steps: steps(["Open invoice", "Approve", "Send receipt"]) },
    { id: "invoice-3", steps: steps(["Open invoice", "Approve", "Send receipt"]) },
  ]);

  assert.deepEqual(report.repeatedBlocks[0].signatures, [
    '["click","crm","button","Open invoice"]',
    '["click","crm","button","Approve"]',
    '["click","crm","button","Send receipt"]',
  ]);
  assert.equal(report.repeatedBlocks[0].occurrences, 3);
});

test("suggests a condition when an optional step appears only in matching context", () => {
  const report = analyzeRecordings([
    {
      id: "priority-1",
      context: { customerTier: "priority" },
      steps: steps(["Open invoice", "Escalate", "Approve"]),
    },
    {
      id: "standard-1",
      context: { customerTier: "standard" },
      steps: steps(["Open invoice", "Approve"]),
    },
    {
      id: "priority-2",
      context: { customerTier: "priority" },
      steps: steps(["Open invoice", "Escalate", "Approve"]),
    },
  ]);

  assert.deepEqual(report.conditionCandidates, [
    {
      stepSignature: '["click","crm","button","Escalate"]',
      when: { field: "customerTier", equals: "priority" },
      confidence: 1,
      support: 2,
    },
  ]);
});

test("uses a fallback id when a capture provider omits one", async () => {
  async function* actions() {
    yield { id: undefined, kind: "click", target: { label: "Save" } };
  }
  const recording = await captureRecording({ id: "capture", source: { actions: actions() } });
  assert.equal(recording.steps[0].id, "step-1");
});

test("does not confuse targets whose labels include a separator", () => {
  const report = analyzeRecordings([
    { id: "one", steps: [{ id: "1", kind: "click", target: { app: "a|b", role: "button", label: "c" } }] },
    { id: "two", steps: [{ id: "2", kind: "click", target: { app: "a", role: "b|button", label: "c" } }] },
  ]);
  assert.deepEqual(report.repeatedBlocks, []);
});

test("replays only steps whose conditions match and stops when a target is missing", async () => {
  const workflow = createWorkflow({
    name: "Approve priority invoice",
    steps: [
      { id: "open", kind: "click", target: { label: "Open invoice" } },
      {
        id: "escalate",
        kind: "click",
        target: { label: "Escalate" },
        when: { field: "customerTier", equals: "priority" },
      },
    ],
  });
  const calls = [];
  const result = await replayWorkflow(workflow, {
    context: { customerTier: "standard" },
    adapter: {
      async ensureTarget(target) {
        return target.label === "Open invoice";
      },
      async perform(step) {
        calls.push(step.id);
      },
    },
  });

  assert.deepEqual(calls, ["open"]);
  assert.deepEqual(result, { status: "completed", completed: ["open"], skipped: ["escalate"] });
});

test("fails safely before an action when a target cannot be found", async () => {
  const workflow = createWorkflow({
    name: "Safe replay",
    steps: [{ id: "delete", kind: "click", target: { label: "Delete" } }],
  });
  const result = await replayWorkflow(workflow, {
    context: {},
    adapter: { async ensureTarget() { return false; }, async perform() {} },
  });

  assert.deepEqual(result, {
    status: "blocked",
    reason: "Target not found for step delete",
    completed: [],
    skipped: [],
  });
});

test("turns a browser interaction into a redacted, replayable audit step", () => {
  const step = toBrowserAuditStep({
    type: "click",
    timestamp: "2026-09-05T10:00:00.000Z",
    page: { url: "https://app.example.test/invoices", title: "Invoices" },
    target: {
      tag: "button",
      role: "button",
      name: "Approve invoice",
      locator: { testId: "approve-invoice", css: "button:nth-of-type(2)" },
      bounds: { x: 10, y: 20, width: 120, height: 32 },
    },
    clipboard: { operation: "paste", text: "Bearer super-secret-token" },
  });

  assert.equal(step.kind, "click");
  assert.equal(step.target.label, "Approve invoice");
  assert.deepEqual(step.audit.clipboard, { operation: "paste", redacted: true, length: 25 });
  assert.equal(step.audit.screenshot.required, true);
});

test("creates an editable audit document with flow, auth, and evidence references", () => {
  const document = buildAuditDocument({
    id: "invoice-run",
    startedAt: "2026-09-05T10:00:00.000Z",
    steps: [
      {
        id: "sign-in",
        kind: "auth",
        target: { label: "Continue with Google" },
        audit: { auth: { method: "oauth", provider: "Google", credentialsCaptured: false } },
      },
      {
        id: "approve",
        kind: "click",
        target: { label: "Approve" },
        audit: { screenshot: { id: "shot-1" }, locator: { testId: "approve" } },
      },
    ],
  });

  assert.match(document, /Continue with Google/);
  assert.match(document, /oauth via Google/);
  assert.match(document, /screenshot:shot-1/);
  assert.match(document, /flowchart TD/);
});

test("redacts clipboard content from LLM review requests", () => {
  assert.deepEqual(redactClipboard("top-secret"), { redacted: true, length: 10 });
  const request = buildLLMReviewRequest({
    name: "Approve invoice",
    steps: [{
      id: "paste",
      kind: "paste",
      target: { label: "Notes" },
      audit: { clipboard: { operation: "paste", text: "top-secret", redacted: true, length: 10 } },
    }],
  });
  assert.match(request.instructions, /propose/);
  assert.doesNotMatch(JSON.stringify(request), /top-secret/);
  assert.equal(request.workflow.steps[0].audit.clipboard.redacted, true);
});

test("removes URL secrets before storing or sending browser audit data", () => {
  const step = toBrowserAuditStep({
    type: "click",
    page: { url: "https://alice:password@example.test/callback?token=secret#fragment", title: "Private customer record" },
    target: { tag: "button", name: "Continue" },
  });
  assert.deepEqual(step.audit.page, { url: "https://example.test/callback" });
  assert.doesNotMatch(JSON.stringify(buildLLMReviewRequest({ steps: [step] })), /secret|password|alice|fragment/);
});

test("local dashboard manages workflows over a loopback-only API", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "automation-recorder-"));
  const dashboard = await startDashboard({ port: 0, dataFile: join(directory, "state.json") });
  t.after(() => dashboard.close());
  const base = `http://127.0.0.1:${dashboard.port}`;

  const created = await fetch(`${base}/api/workflows`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Approve invoice", steps: [{ id: "approve", kind: "click", target: { label: "Approve" } }] }),
  });
  assert.equal(created.status, 201);
  const workflow = await created.json();

  const run = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: workflow.id, status: "running" }),
  });
  assert.equal(run.status, 201);
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.workflows[0].name, "Approve invoice");
  assert.equal(state.runs[0].status, "running");
});
