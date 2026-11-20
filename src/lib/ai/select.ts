import "server-only";
import { anthropicModel, hasApiKey } from "./anthropic";
import { claudeCliModel } from "./claude-cli";
import type { ClaimModel } from "./types";

/**
 * Which model route to use. The API client is the default and the only route
 * in production. The Claude CLI route is a local development convenience: it
 * is chosen only by APP_LLM=claude-cli, and never in a production build or on
 * the host, where the choice falls back to the API client.
 */
function cliAllowed(): boolean {
  return process.env.APP_LLM === "claude-cli" && process.env.NODE_ENV !== "production" && !process.env.NETLIFY;
}

export function getClaimModel(): ClaimModel {
  return cliAllowed() ? claudeCliModel : anthropicModel;
}

/** False when no model can run. The app then works on the code checks alone and says so. */
export function isAiConfigured(): boolean {
  return cliAllowed() || hasApiKey();
}
