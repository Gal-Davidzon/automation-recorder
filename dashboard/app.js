let state = { workflows: [], runs: [] };
let selectedId;
const byId = (id) => document.querySelector(`#${id}`);

async function request(path, options) { const response = await fetch(path, options); if (!response.ok) throw new Error((await response.json()).error); return response.headers.get("content-type")?.includes("json") ? response.json() : response; }
let refreshing = false;
async function refresh() { if (refreshing) return; refreshing = true; try { state = await request("/api/state"); byId("health").textContent = "Local host online"; render(); } catch (error) { byId("health").textContent = error.message; } finally { refreshing = false; } }
function render() { const workflows = state.workflows; if (!selectedId && workflows[0]) selectedId = workflows[0].id; renderWorkflows(workflows); const workflow = workflows.find((item) => item.id === selectedId); byId("workflow-name").value = workflow?.name ?? ""; byId("steps").value = workflow ? JSON.stringify(workflow.steps, null, 2) : ""; renderRuns(state.runs); }
function renderWorkflows(workflows) { const list = byId("workflow-list"); list.replaceChildren(); if (!workflows.length) return list.append(message("No workflows yet.")); workflows.forEach((workflow) => { const button = document.createElement("button"); button.className = `workflow ${workflow.id === selectedId ? "selected" : ""}`; button.dataset.id = workflow.id; button.append(document.createTextNode(workflow.name), detail(`${workflow.steps.length} steps`)); button.onclick = () => { selectedId = workflow.id; render(); }; list.append(button); }); }
function renderRuns(runs) { const list = byId("runs"); list.replaceChildren(); if (!runs.length) return list.append(message("No runs queued.")); runs.forEach((run) => { const card = document.createElement("article"); card.className = "run"; card.append(detail(run.status, "strong"), detail(run.workflowId), detail(new Date(run.startedAt).toLocaleTimeString(), "time")); list.append(card); }); }
byId("new-workflow").onclick = async () => { const workflow = await request("/api/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Untitled workflow", steps: [{ id: "step-1", kind: "click", target: { label: "Describe target" } }] }) }); selectedId = workflow.id; await refresh(); };
byId("save").onclick = async () => { if (!selectedId) return; await request(`/api/workflows/${encodeURIComponent(selectedId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: byId("workflow-name").value, steps: JSON.parse(byId("steps").value) }) }); await refresh(); };
byId("run").onclick = async () => { if (!selectedId) return; await request("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowId: selectedId, status: "queued" }) }); await refresh(); };
byId("analyze").onclick = async () => { byId("analysis").textContent = JSON.stringify(await request("/api/analysis", { method: "POST" }), null, 2); };
byId("audit").onclick = () => { if (selectedId) window.open(`/api/audit/${encodeURIComponent(selectedId)}`, "_blank", "noopener"); };
function detail(value, tag = "small") { const element = document.createElement(tag); element.textContent = value; return element; }
function message(value) { const element = document.createElement("p"); element.className = "empty"; element.textContent = value; return element; }
refresh(); setInterval(refresh, 2000);
