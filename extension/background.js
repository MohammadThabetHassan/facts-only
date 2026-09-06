// Facts Only background service worker.
// Routes verification jobs (from the context menu or chatbot buttons) to the side panel.

const PENDING_KEY = "fo_pendingJob";
const JOB_EVENT_KEY = "fo_jobEvent";

chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup.addListener(setupContextMenu);

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "facts-only-verify-selection",
      title: "Facts Only: verify selected text",
      contexts: ["selection"]
    });
  });
}

// IMPORTANT: chrome.sidePanel.open() is only honored inside a live user-gesture
// context, which expires after awaiting storage writes. Always open the panel
// FIRST, then queue the job — an already-open panel picks the job up via the
// storage-change listener, and a freshly opened one reads it on load.
function makeJob(payload) {
  return { ...payload, ts: Date.now() };
}

async function queueJob(job) {
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "facts-only-verify-selection") return;
  const text = (info.selectionText || "").trim();
  if (!text) return;
  const job = makeJob({ text, sources: [], page: tab && tab.url ? tab.url : "selection" });
  openSidePanel(tab).then(() => queueJob(job)).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "fo:verify" && msg.payload) {
    const tab = sender && sender.tab;
    const job = makeJob({
      text: msg.payload.text || "",
      sources: Array.isArray(msg.payload.sources) ? msg.payload.sources : [],
      page: msg.payload.page || (tab && tab.url) || "chatbot"
    });
    openSidePanel(tab).then(() => queueJob(job)).catch(() => {});
  }
  return false;
});
