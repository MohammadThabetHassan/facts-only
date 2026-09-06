// Minimal i18n for the UI chrome (panel, popup, webapp). Engine-generated text
// (model summaries, heuristic flag labels, the disclaimer) intentionally stays
// English and is documented as such — see docs/ARCHITECTURE.md.
//
// locales: { en, ar } — `ar` must cover every `en` key (enforced by a test).
// Arabic renders RTL: call applyDirection(lang) once per page load.

const EN = {
  // generic buttons / actions
  "btn.verify": "Verify answer",
  "btn.cancel": "Cancel",
  "btn.demo": "Try a demo",
  "btn.clear": "Clear",
  "btn.save": "Save settings",
  "btn.test": "Test connection",
  "btn.export": "Export report (Markdown)",
  "btn.copy": "Copy report",
  "btn.rerun": "Re-run fresh",

  // panel / page chrome
  "app.tagline": "AI-answer verifier",
  "panel.hint": "Paste an AI answer below (or use “verify selected text” / the Verify button on ChatGPT, Gemini, Claude and Perplexity). FactLens splits it into claims, hunts for independent evidence, verifies quotes against the pages, and profiles every source for manipulation patterns.",
  "panel.history": "🕘 Previous reports",
  "input.placeholder": "Paste the AI answer you want to verify…",
  "settings.summary": "⚙️ Settings & API key",
  "webapp.hero.title": "🔍 FactLens",
  "webapp.hero.text": "Paste an AI chatbot answer. FactLens breaks it into claims, searches independently for supporting and contradicting evidence, and flags sources that look like influence campaigns or content farms. It gives you evidence — not a verdict.",
  "webapp.tip": "Tip: the browser extension version can also fetch and profile cited web pages — use it on ChatGPT, Gemini, Claude and Perplexity for the strongest checks.",

  // messages
  "msg.cancelled": "Verification cancelled. Nothing was saved.",
  "msg.copied": "Report copied to clipboard ✓",
  "msg.saved": "Saved ✓",
  "msg.testing": "Testing…",
  "msg.testOk": "Connection works ✓",
  "msg.tooShort": "Paste a longer answer (at least a couple of sentences) to verify.",
  "cache.loaded": "Loaded from cache (ran {mins} min ago).",
  "cache.webnote": "Loaded from cache (ran {mins} min ago) — press “Verify answer” again to force a fresh run.",

  // settings form
  "set.provider": "Verification provider",
  "provider.gemini": "Gemini API (recommended — free, can search the web)",
  "provider.openrouter": "OpenRouter (free models, no web search)",
  "provider.compat": "Custom OpenAI-compatible endpoint (advanced)",
  "provider.mock": "Demo mode (no key, canned results)",
  "set.geminiKey": "Gemini API key",
  "set.model": "Model",
  "set.openrouterKey": "OpenRouter API key",
  "set.compatBase": "Base URL",
  "set.compatKey": "API key",
  "set.grounding": "Use Google Search grounding (Gemini) — check claims against the live web",
  "set.maxClaims": "Max claims to check per run (1–8)",
  "set.second": "Second opinion provider (optional cross-check)",
  "second.none": "No second opinion (single-model verification)",
  "set.language": "UI language",
  "lang.auto": "Auto (follow system)",
  "set.privacy": "Your API key and settings stay on this device. The text you verify is sent only to the AI provider you choose.",
  "hint.gemini": "Free key: aistudio.google.com/apikey → “Create API key”. Gemini can ground answers in live Google search results, which is what powers the independent evidence check.",
  "hint.openrouter": "Key from openrouter.ai/keys. Add “:free” to a model name for free models. Free models cannot search the web, so evidence quality is lower.",
  "hint.compat": "Works with OpenAI, Groq, LM Studio, Ollama (OpenAI bridge)…",
  "hint.mock": "Runs the full pipeline on stored demo data. Useful to see how reports look; it does not verify anything.",
  "set.secondHint": "Optional cross-check against AI monoculture: the checked claims are sent to a second, different provider and it is asked to find what the first review missed. Disagreements are shown in the report. It uses that provider's key/model fields above.",

  // report
  "rep.method": "Method:",
  "rep.verifiedWith": "verified with",
  "m.searchUsed": "live web search used",
  "m.noSearch": "no live web search (model knowledge only)",
  "m.coverage": "{checked} of ~{total} checkable claims examined ({extra} not checked)",
  "m.coverageAll": "{checked} claims examined",
  "m.quotesOk": "{n} quote(s) verified on their pages",
  "m.quotesMissing": "{n} quote(s) NOT found on their pages",
  "m.secondOn": "second-model cross-check: run",
  "m.secondOff": "second-model cross-check: off",
  "rep.nextStep": "Next step: ",
  "rep.claims": "Claims checked ({n})",
  "rep.sources": "Sources ({n})",
  "rep.bias": "Bias & framing",
  "rep.second": "Second opinion",
  "rep.noEvidence": "No independent evidence links were found for this claim.",
  "rep.notFetched": "Page not fetched ({note}); heuristics use the link text only.",
  "rep.warnSources": "{n} source(s) raised flags. Treat their claims with extra caution and prefer the primary sources listed above.",
  "rep.strongest": "Strongest argument against this answer: ",
  "rep.noBias": "No major framing problems found by the analysis.",
  "rep.secondAgree": "The second model agreed with all first-review verdicts.",
  "rep.secondDisagree": "⚠ The second model DISAGREES on {n} claim(s) below — read both sides before deciding.",
  "rep.missedCtx": "Context the second model says was missed:",
  "rep.confidence": "{v} confidence",

  // verdict / stance / trust / quote labels
  "verdict.supported": "supported",
  "verdict.mixed": "mixed",
  "verdict.contradicted": "contradicted",
  "verdict.unverifiable": "unverifiable",
  "stance.support": "support",
  "stance.contradict": "contradict",
  "stance.nuance": "nuance",
  "trust.well-supported": "Well supported",
  "trust.mixed": "Mixed evidence",
  "trust.one-sided": "Heavily one-sided",
  "trust.contradicted": "Key claims contradicted",
  "trust.manipulated-sources": "Manipulated sources detected",
  "trust.unverifiable": "Largely unverifiable",
  "trust.no-claims": "No checkable claims",
  "quote.verified": "quote verified on page",
  "quote.partial": "quote partially found on page",
  "quote.not-found": "quote NOT found on page",
  "quote.page-not-fetched": "page not fetched — quote unchecked"
};

const AR = {
  "btn.verify": "تحقّق من الإجابة",
  "btn.cancel": "إلغاء",
  "btn.demo": "جرّب مثالاً توضيحياً",
  "btn.clear": "تفريغ",
  "btn.save": "حفظ الإعدادات",
  "btn.test": "اختبار الاتصال",
  "btn.export": "تصدير التقرير (Markdown)",
  "btn.copy": "نسخ التقرير",
  "btn.rerun": "إعادة التشغيل من جديد",

  "app.tagline": "مدقّق إجابات الذكاء الاصطناعي",
  "panel.hint": "الصق إجابة ذكاء اصطناعي أدناه (أو استخدم «تحقق من النص المحدد» / زر التحقق في ChatGPT وGemini وClaude وPerplexity). يُقسّم FactLens الإجابة إلى ادعاءات، ويبحث عن أدلة مستقلة، ويتأكد من الاقتباسات مقابل صفحاتها، ويفحص كل مصدر بحثاً عن أنماط التلاعب.",
  "panel.history": "🕘 التقارير السابقة",
  "input.placeholder": "الصق إجابة الذكاء الاصطناعي التي تريد التحقق منها…",
  "settings.summary": "⚙️ الإعدادات ومفتاح الـ API",
  "webapp.hero.title": "🔍 FactLens",
  "webapp.hero.text": "الصق إجابة من روبوت محادثة. يُقسّمها FactLens إلى ادعاءات، ويبحث بشكل مستقل عن أدلة مؤيدة ومعارضة، ويشير إلى المصادر التي تبدو حملات تأثير أو مزارع محتوى. يمنحك أدلة — وليس حكماً.",
  "webapp.tip": "نصيحة: إضافة المتصفح تستطيع أيضاً جلب صفحات المصادر المُستشهد بها وفحصها — استخدمها على ChatGPT وGemini وClaude وPerplexity للحصول على أقوى فحص.",

  "msg.cancelled": "تم إلغاء التحقق. لم يُحفظ أي شيء.",
  "msg.copied": "تم نسخ التقرير إلى الحافظة ✓",
  "msg.saved": "تم الحفظ ✓",
  "msg.testing": "جارٍ الاختبار…",
  "msg.testOk": "الاتصال يعمل ✓",
  "msg.tooShort": "الصق إجابة أطول (بضع جمل على الأقل) للتحقق منها.",
  "cache.loaded": "تم التحميل من الذاكرة المؤقتة (قبل {mins} دقيقة).",
  "cache.webnote": "تم التحميل من الذاكرة المؤقتة (قبل {mins} دقيقة) — اضغط «تحقّق من الإجابة» مجدداً لفرض تشغيل جديد.",

  "set.provider": "مزوّد التحقق",
  "provider.gemini": "Gemini API (موصى به — مجاني ويبحث في الويب)",
  "provider.openrouter": "OpenRouter (نماذج مجانية، بدون بحث في الويب)",
  "provider.compat": "نقطة نهاية متوافقة مع OpenAI (متقدم)",
  "provider.mock": "وضع العرض التوضيحي (بدون مفتاح، نتائج جاهزة)",
  "set.geminiKey": "مفتاح Gemini API",
  "set.model": "الموديل",
  "set.openrouterKey": "مفتاح OpenRouter",
  "set.compatBase": "عنوان URL الأساسي",
  "set.compatKey": "مفتاح API",
  "set.grounding": "استخدام بحث Google (Gemini) — فحص الادعاءات مقابل الويب الحي",
  "set.maxClaims": "الحد الأقصى للادعاءات المفحوصة في التشغيل (1–8)",
  "set.second": "مزوّد الرأي الثاني (فحص متبادل اختياري)",
  "second.none": "بدون رأي ثانٍ (تحقق بنموذج واحد)",
  "set.language": "لغة الواجهة",
  "lang.auto": "تلقائي (حسب النظام)",
  "set.privacy": "مفتاحك وإعداداتك تبقى على جهازك. النص الذي تتحقق منه يُرسَل فقط إلى مزوّد الذكاء الاصطناعي الذي تختاره.",
  "hint.gemini": "مفتاح مجاني: aistudio.google.com/apikey ← «Create API key». يستطيع Gemini تأسيس الإجابات على نتائج بحث Google الحية، وهذا ما يشغّل فحص الأدلة المستقل.",
  "hint.openrouter": "المفتاح من openrouter.ai/keys. أضف «:free» لاسم الموديل للحصول على نماذج مجانية. النماذج المجانية لا تبحث في الويب، لذا جودة الأدلة أقل.",
  "hint.compat": "يعمل مع OpenAI وGroq وLM Studio وOllama (جسر OpenAI)…",
  "hint.mock": "يشغّل خط التحقق كاملاً على بيانات عرض مخزّنة. مفيد لمعرفة شكل التقارير؛ لكنه لا يتحقق من شيء.",
  "set.secondHint": "فحص متبادل اختياري ضد أحادية النموذج: تُرسَل الادعاءات المفحوصة إلى مزوّد ثانٍ مختلف ويُطلب منه إيجاد ما فات المراجعة الأولى. تُعرض الخلافات في التقرير. يستخدم حقول المفتاح/الموديل الخاصة به أعلاه.",

  "rep.method": "الطريقة:",
  "rep.verifiedWith": "تم التحقق بواسطة",
  "m.searchUsed": "استُخدم بحث الويب الحي",
  "m.noSearch": "بدون بحث في الويب (معرفة النموذج فقط)",
  "m.coverage": "فُحصت {checked} من نحو {total} ادعاءً قابلاً للتحقق ({extra} لم تُفحص)",
  "m.coverageAll": "فُحصت {checked} ادعاءات",
  "m.quotesOk": "تأكد {n} اقتباس من صفحاتها",
  "m.quotesMissing": "{n} اقتباسات لم تُعثر في صفحاتها",
  "m.secondOn": "فحص النموذج الثاني: نعم",
  "m.secondOff": "فحص النموذج الثاني: معطّل",
  "rep.nextStep": "الخطوة التالية: ",
  "rep.claims": "الادعاءات المفحوصة ({n})",
  "rep.sources": "المصادر ({n})",
  "rep.bias": "التحيّز والتأطير",
  "rep.second": "الرأي الثاني",
  "rep.noEvidence": "لم تُعثر على روابط أدلة مستقلة لهذا الادعاء.",
  "rep.notFetched": "لم تُجلب الصفحة ({note})؛ الفحص من نص الرابط فقط.",
  "rep.warnSources": "{n} من المصادر أثارت تحذيرات. تعامل مع ادعاءاتها بحذر إضافي وفضّل المصادر الأساسية المذكورة أعلاه.",
  "rep.strongest": "أقوى حجة ضد هذه الإجابة: ",
  "rep.noBias": "لم يجد التحليل مشاكل تأطير كبيرة.",
  "rep.secondAgree": "وافق النموذج الثاني على جميع نتائج المراجعة الأولى.",
  "rep.secondDisagree": "⚠ يختلف النموذج الثاني بشأن {n} ادعاءات أدناه — اقرأ الجانبين قبل أن تقرر.",
  "rep.missedCtx": "سياق يقول النموذج الثاني إنه مفقود:",
  "rep.confidence": "ثقة {v}",

  "verdict.supported": "مؤكَّد",
  "verdict.mixed": "مختلط",
  "verdict.contradicted": "مناقَض",
  "verdict.unverifiable": "غير قابل للتحقق",
  "stance.support": "يدعم",
  "stance.contradict": "يناقض",
  "stance.nuance": "فارق دقيق",
  "trust.well-supported": "مدعوم جيداً",
  "trust.mixed": "أدلة مختلطة",
  "trust.one-sided": "منحاز لجهة واحدة بشدة",
  "trust.contradicted": "ادعاءات رئيسية مناقَضة",
  "trust.manipulated-sources": "رُصدت مصادر متلاعَب بها",
  "trust.unverifiable": "غير قابل للتحقق إلى حد كبير",
  "trust.no-claims": "لا توجد ادعاءات قابلة للفحص",
  "quote.verified": "تأكد الاقتباس من الصفحة",
  "quote.partial": "عُثر على جزء من الاقتباس في الصفحة",
  "quote.not-found": "الاقتباس غير موجود في الصفحة",
  "quote.page-not-fetched": "لم تُجلب الصفحة — لم يُفحص الاقتباس"
};

const LOCALES = { en: EN, ar: AR };
const RTL = new Set(["ar"]);

export function resolveLocale(setting) {
  let lang = setting || "auto";
  if (lang === "auto") {
    const nav = typeof navigator !== "undefined" ? navigator.language || "en" : "en";
    lang = nav.toLowerCase().startsWith("ar") ? "ar" : "en";
  }
  return LOCALES[lang] ? lang : "en";
}

export function isRtl(lang) {
  return RTL.has(lang);
}

export function applyDirection(lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
}

export function t(key, lang = "en", params = null) {
  const table = LOCALES[lang] || EN;
  let s = table[key] != null ? table[key] : EN[key];
  if (s == null) return key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function locales() {
  return Object.keys(LOCALES);
}

export function keys(locale = "en") {
  return Object.keys(LOCALES[locale] || {});
}

// Translate all elements carrying data-i18n (textContent) or
// data-i18n-placeholder / data-i18n-attrs within a root element.
export function applyI18n(root, lang) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, lang);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder, lang));
  });
}
