// Storage adapter: chrome.storage.local in the extension, localStorage elsewhere (webapp).

const PREFIX = "fl_";

const chromeAvailable = typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
const localStorageAvailable = typeof localStorage !== "undefined";

export async function get(key, fallback = undefined) {
  if (chromeAvailable) {
    const res = await chrome.storage.local.get(PREFIX + key);
    return res[PREFIX + key] !== undefined ? res[PREFIX + key] : fallback;
  }
  if (localStorageAvailable) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  return fallback; // non-browser environment (e.g. Node tests) without injected storage
}

export async function set(obj) {
  if (chromeAvailable) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[PREFIX + k] = v;
    await chrome.storage.local.set(out);
    return;
  }
  if (localStorageAvailable) {
    for (const [k, v] of Object.entries(obj)) {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    }
  }
}

export async function remove(key) {
  if (chromeAvailable) return chrome.storage.local.remove(PREFIX + key);
  if (localStorageAvailable) localStorage.removeItem(PREFIX + key);
}

export function onChanged(keys, cb) {
  if (chromeAvailable) {
    const handler = (changes, area) => {
      if (area !== "local") return;
      const hit = keys.some((k) => changes[PREFIX + k]);
      if (hit) cb();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (e) => {
    if (e.key && keys.some((k) => e.key === PREFIX + k)) cb();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export const DEFAULT_SETTINGS = {
  provider: "gemini",
  secondProvider: "none",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  openrouterKey: "",
  openrouterModel: "google/gemini-2.5-flash",
  compatBase: "https://api.openai.com/v1",
  compatKey: "",
  compatModel: "gpt-4o-mini",
  grounding: true,
  maxClaims: 5
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await get("settings", {})) };
}

export async function saveSettings(s) {
  await set({ settings: s });
}
