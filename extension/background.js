const STATUS_KEY = "automation-recorder-status";
const EVENTS_KEY = "automation-recorder-events";
const SCREENSHOTS_KEY = "automation-recorder-screenshots";
let writeQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ [STATUS_KEY]: { recording: false, captureScreenshots: false } }));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-status") {
    chrome.storage.local.get(STATUS_KEY, (data) => sendResponse(data[STATUS_KEY] ?? { recording: false }));
    return true;
  }
  if (message.type === "set-recording") {
    const nextStatus = { recording: Boolean(message.recording), captureScreenshots: Boolean(message.captureScreenshots) };
    chrome.storage.local.set({ [STATUS_KEY]: nextStatus }, async () => {
      const tabs = await chrome.tabs.query({});
      tabs.forEach((tab) => chrome.tabs.sendMessage(tab.id, { type: "recorder-status", status: nextStatus }).catch(() => {}));
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message.type === "export-recording") {
    chrome.storage.local.get([EVENTS_KEY, SCREENSHOTS_KEY], (data) => sendResponse({ events: data[EVENTS_KEY] ?? [], screenshots: data[SCREENSHOTS_KEY] ?? {} }));
    return true;
  }
  if (message.type === "clear-recording") {
    chrome.storage.local.remove([EVENTS_KEY, SCREENSHOTS_KEY], () => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "record-event") {
    writeQueue = writeQueue.catch(() => {}).then(() => recordEvent(message.event, sender));
    writeQueue.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function recordEvent(event, sender) {
  const status = await get(STATUS_KEY);
  if (!status?.recording) return;
  const stored = { ...event, id: crypto.randomUUID() };
  if (event.screenshot?.required && status.captureScreenshots && sender.tab?.windowId !== undefined) {
    const imageDataUrl = await capture(sender.tab);
    if (imageDataUrl) {
      const screenshotId = `shot-${stored.id}`;
      stored.screenshot = { id: screenshotId };
      const screenshots = await get(SCREENSHOTS_KEY) ?? {};
      screenshots[screenshotId] = imageDataUrl;
      await set(SCREENSHOTS_KEY, screenshots);
    }
  }
  const events = await get(EVENTS_KEY) ?? [];
  await set(EVENTS_KEY, [...events, stored]);
}

async function capture(tab) {
  const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (activeTab?.id !== tab.id) return undefined;
  return new Promise((resolve) => chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (imageDataUrl) => {
    resolve(chrome.runtime.lastError ? undefined : imageDataUrl);
  }));
}
function get(key) { return new Promise((resolve) => chrome.storage.local.get(key, (data) => resolve(data[key]))); }
function set(key, value) { return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve)); }
