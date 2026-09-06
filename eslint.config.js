// Lint config. Dev-only: nothing here ships, and the extension still has zero
// runtime dependencies.
//
// The rule set is deliberately small. It is not a style opinion - it is the
// specific class of defect this project has actually shipped:
//
//   * `no-undef` would have caught a call to a helper that did not exist in that
//     file (`downloadMd` in panel.js), which reached the browser as a crash.
//   * `no-unused-vars` would have caught a dead `postJson` import that sat in
//     sourceProfiler.js unnoticed.
//   * `no-empty` catches the swallowed catch blocks that hide the failures this
//     tool is supposed to report loudly.
//
// Style is left to .editorconfig. Arguing about it in CI is not worth a build.

export default [
  {
    files: ["extension/**/*.js", "webapp/**/*.js", "eval/**/*.mjs", "test/**/*.mjs", "scripts/**/*.mjs"],
    ignores: ["firefox-build/**", "dist/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        DOMException: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        MutationObserver: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        // Extension
        chrome: "readonly",
        // Node (tests, eval, scripts)
        process: "readonly",
        globalThis: "readonly",
        Buffer: "readonly"
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      eqeqeq: ["error", "smart"],
      "no-implicit-globals": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-fallthrough": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error"
    }
  },
  {
    // Content scripts are classic scripts, not modules: no imports, and they run
    // inside an IIFE on pages the extension does not control.
    files: ["extension/content/*.js", "firefox-build/content/*.js"],
    languageOptions: { sourceType: "script" }
  }
];
