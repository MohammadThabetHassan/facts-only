// fetch helpers with timeout, automatic retry, and external cancellation.
// Retry policy: 429/5xx and network errors are retried with exponential backoff,
// honoring Retry-After when present. An aborted external signal is NEVER retried.

/**
 * An HTTP-layer Error carrying the response status, so callers can decide
 * whether a failure is retryable or terminal without re-parsing a message.
 * @typedef {Error & {status?: number, raw?: string}} HttpError
 */

/** @typedef {{retries?: number, signal?: AbortSignal}} RequestOptions */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt, retryAfterHeader) {
  const ra = parseFloat(retryAfterHeader || "");
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000 + 250, 30000);
  return Math.min(1200 * 2 ** attempt + Math.random() * 400, 30000);
}

// Combine the per-request timeout with an optional external AbortSignal.
function combineSignals(external, timeoutCtrl) {
  if (!external) return timeoutCtrl.signal;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutCtrl.signal, external]);
  }
  return external; // very old engines: external signal wins, timeout degrades
}

/**
 * @param {string} url
 * @param {unknown} body
 * @param {number} [timeoutMs]
 * @param {Record<string,string>} [headers]
 * @param {RequestOptions} [options]
 * @returns {Promise<Response>}
 */
export async function postJson(url, body, timeoutMs = 90000, headers = {}, { retries = 2, signal } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: combineSignals(signal, timeoutCtrl)
      });
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const retryAfter = res.headers.get("retry-after");
        await res.arrayBuffer().catch(() => {}); // drain before reusing the connection
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      return res;
    } catch (e) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
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

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @param {AbortSignal} [signal]
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, timeoutMs = 10000, signal = undefined, init = {}) {
  if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      credentials: "omit",
      ...init,
      signal: combineSignals(signal, timeoutCtrl)
    });
  } finally {
    clearTimeout(timer);
  }
}
