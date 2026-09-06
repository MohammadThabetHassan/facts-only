// fetch helpers with timeout and automatic retry, shared by all providers
// and the source profiler. Retry policy: 429/5xx and network errors are
// retried with exponential backoff, honoring Retry-After when present.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt, retryAfterHeader) {
  const ra = parseFloat(retryAfterHeader || "");
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000 + 250, 30000);
  return Math.min(1200 * 2 ** attempt + Math.random() * 400, 30000);
}

export async function postJson(url, body, timeoutMs = 90000, headers = {}, { retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const retryAfter = res.headers.get("retry-after");
        await res.arrayBuffer().catch(() => {}); // drain before reusing the connection
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      return res;
    } catch (e) {
      // Network failure or timeout: retry, then surface the last error.
      lastError = e;
      if (attempt < retries) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("request failed");
}

export async function fetchWithTimeout(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: ctrl.signal, credentials: "omit" });
  } finally {
    clearTimeout(timer);
  }
}
