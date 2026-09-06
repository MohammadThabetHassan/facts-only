// Provider factory.

import { createGeminiProvider } from "./gemini.js";
import { createOpenRouterProvider } from "./openrouter.js";
import { createCompatProvider } from "./openai-compat.js";
import { createMockProvider } from "./mock.js";

export function createProvider(settings) {
  switch ((settings && settings.provider) || "gemini") {
    case "gemini":
      return createGeminiProvider(settings);
    case "openrouter":
      return createOpenRouterProvider(settings);
    case "openai-compat":
      return createCompatProvider(settings);
    case "mock":
      return createMockProvider();
    default:
      throw new Error(`Unknown provider "${settings.provider}"`);
  }
}
