import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Output } from "./schema";
import { ModelError, type ClaimModel } from "./types";

// Sonnet 5.5: the task is narrow (find and quote claims in a short ad), and
// code checks the numbers. Low effort keeps the answer fast enough for a page.
// The 9 second limit is this app's own budget, not the host's: a reviewer
// should not watch a spinner for longer, so a slow call ends as "unavailable"
// with a Try again button.
export const MODEL_ID = "claude-sonnet-5-5";

let client: Anthropic | null = null;

/**
 * How long one model call may take. The default suits a page: a slower call
 * ends as "unavailable" with a Try again button. AI_TIMEOUT_MS overrides it. The
 * evaluation sets a longer limit, because it measures what the model reads,
 * not how fast it answers.
 */
function timeoutMs(): number {
  const set = Number(process.env.AI_TIMEOUT_MS);
  return Number.isInteger(set) && set >= 1_000 && set <= 120_000 ? set : 9_000;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const anthropicModel: ClaimModel = {
  name: MODEL_ID,
  async find({ system, user }) {
    if (!hasApiKey()) throw new ModelError("not_configured", "ANTHROPIC_API_KEY is not set.");
    client ??= new Anthropic({ timeout: timeoutMs(), maxRetries: 0 });
    let response;
    try {
      response = await client.messages.parse({
        model: MODEL_ID,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "low", format: zodOutputFormat(Output) },
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        throw new ModelError("not_configured", "The API key was not accepted.");
      }
      // A request the API rejects (for example, an account with no credit) is
      // the service not being usable. It says nothing about the ad, so it is
      // "unavailable", not an unreadable answer.
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIError) {
        throw new ModelError("unavailable", "The model could not be reached.");
      }
      throw new ModelError("invalid", "The model's answer could not be read.");
    }
    // A safety decline or a cut-off answer is a failure, never an empty result.
    if (response.stop_reason === "refusal") throw new ModelError("refusal", "The model declined.");
    if (response.stop_reason === "max_tokens") throw new ModelError("truncated", "The answer was cut off.");
    if (!response.parsed_output) throw new ModelError("invalid", "The answer did not match the schema.");
    return response.parsed_output;
  },
};
