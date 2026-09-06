// Touchstone content script: injects a "Verify" button under AI answers on major chatbots.
// Classic script (content scripts cannot use ES module imports).

(() => {
  "use strict";

  const HOST_CONFIGS = [
    {
      test: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/,
      messageSelectors: [
        // logged-in DOM
        '[data-message-author-role="assistant"]',
        // logged-out DOM (2026 redesign): hashed classes, e.g. "wUdOQ_assistantMessage".
        // Match the stable suffix, exclude the actions bar that also contains it.
        '[class*="assistantMessage"]:not([class*="Actions"])'
      ],
      buttonContainer: (el) => el.closest("article") || el.parentElement || el
    },
    {
      test: /(^|\.)gemini\.google\.com$/,
      messageSelectors: ["model-response"],
      buttonContainer: (el) => el
    },
    {
      test: /(^|\.)claude\.ai$/,
      messageSelectors: ['[data-testid="assistant-message"]', ".font-claude-message"],
      buttonContainer: (el) => el.parentElement || el
    },
    {
      test: /(^|\.)perplexity\.ai$/,
      messageSelectors: ['[data-testid="answer"]', ".answer-container"],
      buttonContainer: (el) => el.parentElement || el
    }
  ];

  const config = HOST_CONFIGS.find((c) => c.test.test(location.hostname));
  if (!config) return;

  const BUTTON_LABEL = "🔍 Touchstone — verify this answer";

  function makeButton(getText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = BUTTON_LABEL;
    btn.setAttribute("aria-label", "Verify this AI answer with Touchstone");
    Object.assign(btn.style, {
      font: "500 12px/1.4 system-ui, sans-serif",
      padding: "5px 12px",
      marginTop: "6px",
      borderRadius: "999px",
      border: "1px solid #2563eb",
      background: "#eff6ff",
      color: "#1d4ed8",
      cursor: "pointer",
      display: "inline-block"
    });
    btn.addEventListener("mouseenter", () => (btn.style.background = "#dbeafe"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#eff6ff"));
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      btn.disabled = true;
      btn.textContent = "Sending to Touchstone panel…";
      try {
        chrome.runtime.sendMessage({ type: "ts:verify", payload: collect(getText()) }, () => {
          void chrome.runtime.lastError; // panel may be closed; job still queued
        });
      } catch (e) {
        // extension context invalidated (e.g. reloaded) — restore the button
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Sent ✓ — open the Touchstone panel";
        setTimeout(() => (btn.textContent = BUTTON_LABEL), 4000);
      }, 600);
    });
    return btn;
  }

  function collect(el) {
    const sources = [];
    el.querySelectorAll("a[href]").forEach((a) => {
      try {
        const u = new URL(a.href, location.href);
        if (u.protocol !== "http:" && u.protocol !== "https:") return;
        if (sources.some((s) => s.url === u.href)) return;
        sources.push({ url: u.href, title: (a.textContent || "").trim().slice(0, 140) });
      } catch (e) {
        /* ignore malformed hrefs */
      }
    });
    const text = (el.innerText || "").slice(0, 15000);
    return { text, sources, page: location.hostname };
  }

  function scan() {
    for (const sel of config.messageSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.innerText || el.innerText.trim().length < 60) return;
        if (el.dataset.tsDone === "1") return;
        el.dataset.tsDone = "1";
        const holder = config.buttonContainer(el);
        if (!holder || holder.dataset.tsBtn === "1") return;
        holder.dataset.tsBtn = "1";
        holder.appendChild(makeButton(() => el));
      });
    }
  }

  let timer = null;
  const scheduleScan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        scan();
      } catch (e) {
        /* page may be mid-render */
      }
    }, 800);
  };

  scan();
  window.addEventListener("load", scan);
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
})();
