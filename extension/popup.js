const status = document.querySelector("#status");
const toggle = document.querySelector("#toggle");

refresh();
toggle.addEventListener("click", async () => {
  const current = await message({ type: "get-status" });
  await message({ type: "set-recording", recording: !current.recording, captureScreenshots: document.querySelector("#screenshots").checked });
  refresh();
});
document.querySelector("#clear").addEventListener("click", async () => { await message({ type: "clear-recording" }); });
document.querySelector("#export").addEventListener("click", async () => {
  const data = await message({ type: "export-recording" });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  chrome.downloads?.download({ url, filename: `automation-audit-${Date.now()}.json`, saveAs: true });
});
async function refresh() {
  const current = await message({ type: "get-status" });
  status.textContent = current.recording ? "Recording browser interactions" : "Not recording";
  toggle.textContent = current.recording ? "Stop recording" : "Start recording";
  document.querySelector("#screenshots").checked = Boolean(current.captureScreenshots);
}
function message(payload) { return new Promise((resolve) => chrome.runtime.sendMessage(payload, resolve)); }
