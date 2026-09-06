// Ambient declarations for the type check only. Nothing here ships, and there is
// still no build step - `npm run typecheck` reads the JSDoc and exits.

// The extension APIs. Typed as `any` deliberately: pulling in @types/chrome
// would add a dependency to a zero-dependency project in order to check four
// call sites, and storage.js already guards every use behind a feature test
// (`chromeAvailable`) because the same module runs in the web app, where
// `chrome` genuinely does not exist.
declare const chrome: any;
