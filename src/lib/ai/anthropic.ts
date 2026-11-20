import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { FINDING_KINDS, ModelError, type ClaimModel } from "./types";

// Sonnet 5.5: the task is narrow (find and quote claims in a short ad), and
// code checks the numbers. Low effort keeps the answer fast enough for a page.
// The timeout stays under the host's 10 second limit for a server function, so
// a slow call ends as "unavailable" with a Try again button, not a broken page.
export const MODEL_ID = "claude-sonnet-5-5";

const Output = z.object({
  findings: z.array(
    z.object({
      quote: z.string(),
      kind: z.enum(FINDING_KINDS),
      why: z.string(),
      suggested_comment: z.string(),
    }),
  ),
  copy_addresses_reviewer: z.boolean(),
});

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const anthropicModel: ClaimModel = {
  name: MODEL_ID,
  async find({ system, user }) {
    if (!isAiConfigured()) throw new ModelError("not_configured", "ANTHROPIC_API_KEY is not set.");
    client ??= new Anthropic({ timeout: 9_000, maxRetries: 0 });
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
      if (e instanceof Anthropic.BadRequestError) {
        throw new ModelError("invalid", "The request was rejected.");
      }
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
