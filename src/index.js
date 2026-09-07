/**
 * Portable workflow core. Native hosts feed it normalized actions and implement
 * the adapter interface during replay; the core never sends OS input itself.
 */

export function actionSignature(step) {
  const target = step.target ?? {};
  return JSON.stringify([step.kind ?? "unknown", target.app ?? "", target.role ?? "", target.label ?? ""]);
}

export function createWorkflow({ name, steps, metadata = {} }) {
  if (!name?.trim()) throw new Error("A workflow needs a name");
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("A workflow needs at least one step");
  }

  const ids = new Set();
  for (const step of steps) {
    if (!step.id || !step.kind || !step.target) {
      throw new Error("Every step needs id, kind, and target");
    }
    if (ids.has(step.id)) throw new Error(`Duplicate step id: ${step.id}`);
    ids.add(step.id);
  }

  const { id, createdAt, ...workflowMetadata } = metadata;
  return {
    version: 1,
    id: id ?? slug(name),
    name: name.trim(),
    createdAt: createdAt ?? new Date().toISOString(),
    metadata: workflowMetadata,
    steps,
  };
}

/**
 * Collects a normalized recording from a platform-specific source. A source
 * produces only privacy-reviewed, serializable actions; it never leaks raw
 * window contents into the portable workflow by default.
 */
export async function captureRecording({ id, context = {}, source, maxSteps = 10_000, signal }) {
  if (!source?.actions || typeof source.actions[Symbol.asyncIterator] !== "function") {
    throw new Error("A capture source must expose an async actions iterator");
  }
  const steps = [];
  for await (const action of source.actions) {
    if (signal?.aborted) throw new Error("Recording cancelled");
    if (steps.length >= maxSteps) throw new Error(`Recording reached its ${maxSteps}-step limit`);
    if (!action?.kind || !action?.target) continue;
    steps.push({ ...action, id: action.id ?? `step-${steps.length + 1}` });
  }
  return { id: id ?? `recording-${Date.now()}`, context, steps };
}

export function analyzeRecordings(recordings) {
  const normalized = recordings.filter((recording) => Array.isArray(recording.steps));
  const indexed = normalized.map((recording) => ({
    ...recording,
    signatures: new Set(recording.steps.map(actionSignature)),
  }));
  return {
    repeatedBlocks: findRepeatedBlocks(normalized),
    conditionCandidates: findConditionCandidates(indexed),
  };
}

function findRepeatedBlocks(recordings) {
  const root = { children: new Map(), recordingIds: new Set() };
  for (const recording of recordings) {
    const signatures = recording.steps.map(actionSignature);
    for (let start = 0; start < signatures.length; start += 1) {
      let node = root;
      for (let end = start; end < signatures.length; end += 1) {
        const signature = signatures[end];
        node = node.children.get(signature) ?? createNode(node, signature);
        node.recordingIds.add(recording.id);
      }
    }
  }

  return collectRepeatedBlocks(root)
    .sort((a, b) => b.signatures.length - a.signatures.length || b.occurrences - a.occurrences);
}

function findConditionCandidates(recordings) {
  const allContextFields = new Set(recordings.flatMap((recording) => Object.keys(recording.context ?? {})));
  const allSignatures = new Set(recordings.flatMap((recording) => [...recording.signatures]));
  const candidates = [];

  for (const signature of allSignatures) {
    const present = recordings.filter((recording) => recording.signatures.has(signature));
    if (present.length === 0 || present.length === recordings.length) continue;

    for (const field of allContextFields) {
      const values = new Set(present.map((recording) => recording.context?.[field]).filter((value) => value !== undefined));
      for (const value of values) {
        const matching = recordings.filter((recording) => recording.context?.[field] === value);
        if (matching.length === 0) continue;
        const support = matching.filter((recording) => recording.signatures.has(signature)).length;
        const confidence = support / matching.length;
        if (confidence === 1 && support >= 2) {
          candidates.push({
            stepSignature: signature,
            when: { field, equals: value },
            confidence,
            support,
          });
        }
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence || b.support - a.support || a.stepSignature.localeCompare(b.stepSignature));
}

function createNode(parent, signature) {
  const node = { signature, children: new Map(), recordingIds: new Set() };
  parent.children.set(signature, node);
  return node;
}

function collectRepeatedBlocks(root) {
  const repeated = [];
  const visit = (node, path) => {
    for (const child of node.children.values()) {
      const childPath = [...path, child.signature];
      if (childPath.length >= 2 && child.recordingIds.size >= 2) {
        repeated.push({ signatures: childPath, occurrences: child.recordingIds.size });
      }
      visit(child, childPath);
    }
  };
  visit(root, []);
  return repeated;
}

export async function replayWorkflow(workflow, { context = {}, adapter }) {
  if (!adapter?.ensureTarget || !adapter?.perform) {
    throw new Error("A replay adapter needs ensureTarget and perform methods");
  }
  const completed = [];
  const skipped = [];
  for (const step of workflow.steps) {
    if (!conditionMatches(step.when, context)) {
      skipped.push(step.id);
      continue;
    }
    if (!(await adapter.ensureTarget(step.target, step))) {
      return {
        status: "blocked",
        reason: `Target not found for step ${step.id}`,
        completed,
        skipped,
      };
    }
    await adapter.perform(step, context);
    completed.push(step.id);
  }
  return { status: "completed", completed, skipped };
}

function conditionMatches(condition, context) {
  return !condition || context[condition.field] === condition.equals;
}

function slug(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export { buildAuditDocument, buildLLMReviewRequest, redactClipboard, toBrowserAuditStep } from "./browser.js";
