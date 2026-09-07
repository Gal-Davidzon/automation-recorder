import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRecordings, createWorkflow } from "./index.js";
import { buildAuditDocument } from "./browser.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const dashboardDirectory = resolve(sourceDirectory, "../dashboard");
const defaultDataFile = resolve(sourceDirectory, "../.automation-recorder/state.json");

export async function startDashboard({ port = 4311, host = "127.0.0.1", dataFile = defaultDataFile } = {}) {
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Dashboard may bind only to loopback");
  const store = await createStore(dataFile);
  const server = createServer((request, response) => handleRequest(request, response, store));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    port: server.address().port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function handleRequest(request, response, store) {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/state" && request.method === "GET") return json(response, 200, await store.read());
    if (url.pathname === "/api/workflows" && request.method === "POST") return createWorkflowRoute(request, response, store);
    if (url.pathname === "/api/runs" && request.method === "POST") return createRunRoute(request, response, store);
    if (url.pathname === "/api/analysis" && request.method === "POST") return analyzeRoute(response, store);
    if (url.pathname.startsWith("/api/audit/") && request.method === "GET") return auditRoute(response, store, decodeURIComponent(url.pathname.slice(11)));
    if (url.pathname.startsWith("/api/workflows/") && request.method === "PATCH") return updateWorkflowRoute(request, response, store, decodeURIComponent(url.pathname.slice(15)));
    if (url.pathname.startsWith("/api/workflows/") && request.method === "DELETE") return deleteWorkflowRoute(response, store, decodeURIComponent(url.pathname.slice(15)));
    if (url.pathname.startsWith("/api/")) return json(response, 404, { error: "Not found" });
    return staticFile(response, url.pathname);
  } catch (error) {
    return json(response, error.statusCode ?? 500, { error: error.message });
  }
}

async function createWorkflowRoute(request, response, store) {
  const body = await bodyJson(request);
  const workflow = createWorkflow({ name: body.name, steps: body.steps, metadata: { ...body.metadata, id: body.id } });
  const state = await store.update((current) => {
    if (current.workflows.some((item) => item.id === workflow.id)) throw conflict("A workflow with this id already exists");
    return { ...current, workflows: [...current.workflows, workflow] };
  });
  json(response, 201, state.workflows.at(-1));
}

async function updateWorkflowRoute(request, response, store, id) {
  const patch = await bodyJson(request);
  const state = await store.update((current) => {
    const index = current.workflows.findIndex((workflow) => workflow.id === id);
    if (index < 0) throw notFound("Workflow not found");
    const currentWorkflow = current.workflows[index];
    const workflow = createWorkflow({
      name: patch.name ?? currentWorkflow.name,
      steps: patch.steps ?? currentWorkflow.steps,
      metadata: { ...currentWorkflow.metadata, ...patch.metadata, id, createdAt: currentWorkflow.createdAt },
    });
    return { ...current, workflows: current.workflows.map((item, itemIndex) => itemIndex === index ? workflow : item) };
  });
  const workflow = state.workflows.find((item) => item.id === id);
  json(response, 200, workflow);
}

async function deleteWorkflowRoute(response, store, id) {
  const state = await store.update((current) => ({ ...current, workflows: current.workflows.filter((workflow) => workflow.id !== id) }));
  json(response, 200, { deleted: !state.workflows.some((workflow) => workflow.id === id) });
}

async function createRunRoute(request, response, store) {
  const body = await bodyJson(request);
  const state = await store.update((current) => {
    if (!current.workflows.some((workflow) => workflow.id === body.workflowId)) throw notFound("Workflow not found");
    const run = { id: crypto.randomUUID(), workflowId: body.workflowId, status: body.status ?? "queued", startedAt: new Date().toISOString(), events: [] };
    return { ...current, runs: [run, ...current.runs] };
  });
  json(response, 201, state.runs[0]);
}

async function analyzeRoute(response, store) {
  const state = await store.read();
  const recordings = state.workflows.map((workflow) => ({ id: workflow.id, context: workflow.metadata?.context ?? {}, steps: workflow.steps }));
  json(response, 200, analyzeRecordings(recordings));
}

async function auditRoute(response, store, id) {
  const workflow = (await store.read()).workflows.find((item) => item.id === id);
  if (!workflow) throw notFound("Workflow not found");
  response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
  response.end(buildAuditDocument(workflow));
}

async function staticFile(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = resolve(dashboardDirectory, requested);
  if (!file.startsWith(`${dashboardDirectory}/`)) throw notFound("Not found");
  const contents = await readFile(file);
  response.writeHead(200, { "content-type": mime(file) });
  response.end(contents);
}

async function createStore(file) {
  await mkdir(dirname(file), { recursive: true });
  let writeQueue = Promise.resolve();
  let cachedState;
  return {
    async read() {
      if (!cachedState) {
        try { cachedState = normalizeState(JSON.parse(await readFile(file, "utf8"))); } catch (error) { if (error.code === "ENOENT") cachedState = normalizeState({}); else throw error; }
      }
      return structuredClone(cachedState);
    },
    async update(transform) {
      const operation = writeQueue.then(async () => {
        const next = normalizeState(transform(await this.read()));
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
        await rename(temporary, file);
        cachedState = next;
        return next;
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },
  };
}

function normalizeState(state) { return { workflows: state.workflows ?? [], runs: state.runs ?? [] }; }
function bodyJson(request) { return new Promise((resolve, reject) => { let data = ""; let settled = false; const fail = (error) => { if (!settled) { settled = true; reject(error); } }; request.on("data", (chunk) => { if (settled) return; if (Buffer.byteLength(data) + chunk.length > 1_000_000) return fail(Object.assign(new Error("Request too large"), { statusCode: 413 })); data += chunk; }); request.on("end", () => { if (settled) return; try { settled = true; resolve(JSON.parse(data || "{}")); } catch { fail(Object.assign(new Error("Invalid JSON"), { statusCode: 400 })); } }); }); }
function json(response, status, payload) { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(payload)); }
function notFound(message) { return Object.assign(new Error(message), { statusCode: 404 }); }
function conflict(message) { return Object.assign(new Error(message), { statusCode: 409 }); }
function mime(file) { return { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" }[extname(file)] ?? "application/octet-stream"; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dashboard = await startDashboard();
  console.log(`Automation Recorder dashboard: http://127.0.0.1:${dashboard.port}`);
}
