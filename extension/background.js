// FactLens background service worker.
// Routes verification jobs (from the context menu or chatbot buttons) to the side panel.

const PENDING_KEY = "fl_pendingJob";
const JOB_EVENT_KEY = "fl_jobEvent";

chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup.addListener(setupContextMenu);

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "factlens-verify-selection",
      title: "FactLens: verify selected text",
      contexts: ["selection"]
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "factlens-verify-selection") return;
  const text = (info.selectionText || "").trim();
  if (!text) return;
  await enqueueJob({ text, sources: [], page: tab && tab.url ? tab.url : "selection" });
  await openSidePanel(tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "fl:verify" && msg.payload) {
    const tab = sender && sender.tab;
    enqueueJob({
      text: msg.payload.text || "",
      sources: Array.isArray(msg.payload.sources) ? msg.payload.sources : [],
      page: msg.payload.page || (tab && tab.url) || "chatbot"
    })
      .then(() => openSidePanel(tab))
      .catch(() => {});
  }
  return false;
});

async function enqueueJob(payload) {
  const job = { ...payload, ts: Date.now() };
  await chrome.storage.local.set({ [PENDING_KEY]: job, [JOB_EVENT_KEY]: { ts: job.ts } });
}

async function openSidePanel(tab) {
  try {
    if (tab && tab.windowId != null) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (e) {
    // Panel may already be open, or the browser refused the gesture.
    // The storage-change event still notifies an open panel; if closed,
    // the job is consumed the next time the panel opens.
  }
}
