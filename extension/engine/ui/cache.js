// Result cache: identical answer + identical settings ⇒ identical report.
// Stored entries are capped and evicted oldest-first. The cache lives at the
// UI layer (panel/webapp) so the engine stays pure; the storage adapter is
// injectable for tests.

import { hash32 } from "../text.js";

function keyOf(text, fingerprint) {
  return `${hash32(text)}|${fingerprint}`;
}

export function settingsFingerprint(settings) {
  const s = settings || {};
  return [
    s.provider,
    s.geminiModel,
    s.openrouterModel,
    s.compatModel,
    s.grounding === false ? "noground" : "ground",
    s.maxClaims,
    s.secondProvider || "none"
  ].join("|");
}

export async function lookupCache(text, fingerprint, { storage, ttlMs = 1000 * 60 * 60 * 24 * 7 } = {}) {
  const store = storage || (await import("./storage.js"));
  const entries = (await store.get("cache", [])) || [];
  const k = keyOf(text, fingerprint);
  const hit = entries.find((e) => e.k === k);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) return null;
  return { report: hit.report, ts: hit.ts };
}

export async function saveToCache(text, fingerprint, report, { storage, maxEntries = 10 } = {}) {
  const store = storage || (await import("./storage.js"));
  const entries = (await store.get("cache", [])) || [];
  const k = keyOf(text, fingerprint);
  const next = [{ k, ts: Date.now(), report }, ...entries.filter((e) => e.k !== k)].slice(0, maxEntries);
  await store.set({ cache: next });
}
