import { analyzeRecordings, createWorkflow, replayWorkflow } from "./index.js";

const demoRecordings = [
  { id: "priority-a", context: { customerTier: "priority" }, steps: ["Open invoice", "Escalate", "Approve"] },
  { id: "standard-a", context: { customerTier: "standard" }, steps: ["Open invoice", "Approve"] },
  { id: "priority-b", context: { customerTier: "priority" }, steps: ["Open invoice", "Escalate", "Approve"] },
].map((recording) => ({
  ...recording,
  steps: recording.steps.map((label, index) => ({
    id: `${recording.id}-${index + 1}`,
    kind: "click",
    target: { app: "crm", role: "button", label },
  })),
}));

if (process.argv[2] !== "demo") {
  console.log("Usage: npm run demo");
  process.exit(0);
}

const analysis = analyzeRecordings(demoRecordings);
console.log("Workflow analysis:\n", JSON.stringify(analysis, null, 2));

const workflow = createWorkflow({
  name: "Approve priority invoice",
  steps: demoRecordings[0].steps.map((step) => ({
    ...step,
    when: step.target.label === "Escalate" ? { field: "customerTier", equals: "priority" } : undefined,
  })),
});
const result = await replayWorkflow(workflow, {
  context: { customerTier: "standard" },
  adapter: {
    async ensureTarget() { return true; },
    async perform(step) { console.log(`Performed: ${step.target.label}`); },
  },
});
console.log("Replay result:\n", JSON.stringify(result, null, 2));
