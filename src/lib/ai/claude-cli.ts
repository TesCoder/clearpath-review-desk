import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { MODEL_ID } from "./anthropic";
import { Output } from "./schema";
import { ModelError, type ClaimModel, type ModelOutput } from "./types";

// Local development only: the same request through the Claude Code CLI
// (`claude -p`), on the Claude plan signed in on the developer's machine, so
// testing costs nothing. The deployed demo never uses this route (select.ts).
//
// The CLI is an agent, so it is locked down to one model call: no tools, no
// MCP servers, no skills, no settings or CLAUDE.md files, no saved session,
// and it runs from an empty folder. The API key is removed from its
// environment so the plan login is used. Results are labeled
// "claude-cli:<model>" so they never mix with results from the API.

const TIMEOUT_MS = 120_000;

function run(args: string[], input: string, cwd: string): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn("claude", args, { cwd, env, stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, code });
    });
    child.stdin.end(input);
  });
}

export const claudeCliModel: ClaimModel = {
  name: `claude-cli:${MODEL_ID}`,
  async find({ system, user }) {
    // The CLI rejects a schema that names its own dialect, so "$schema" is left out.
    const { $schema: _dialect, ...schema } = z.toJSONSchema(Output) as Record<string, unknown>;
    void _dialect;
    const args = [
      "-p",
      "--output-format", "json",
      "--system-prompt", system,
      "--json-schema", JSON.stringify(schema),
      "--model", MODEL_ID,
      "--effort", "low",
      "--tools", "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--setting-sources", "",
      "--no-session-persistence",
    ];
    const empty = await mkdtemp(join(tmpdir(), "clearpath-cli-"));
    let result;
    try {
      result = await run(args, user, empty);
    } catch {
      // Not installed, not signed in, or too slow.
      throw new ModelError("unavailable", "The Claude CLI could not be run.");
    } finally {
      await rmdir(empty).catch(() => {}); // removes the folder only if it is still empty
    }

    let out: Record<string, unknown>;
    try {
      out = JSON.parse(result.stdout);
    } catch {
      throw new ModelError("unavailable", "The Claude CLI did not return JSON.");
    }
    const stop = String(out.stop_reason ?? "");
    const safetyStops = out.safety_stops;
    if (stop === "refusal" || (Array.isArray(safetyStops) && safetyStops.length > 0)) {
      throw new ModelError("refusal", "The model declined.");
    }
    if (stop === "max_tokens") throw new ModelError("truncated", "The answer was cut off.");
    if (out.is_error) throw new ModelError("unavailable", "The Claude CLI reported an error.");
    const parsed = Output.safeParse(out.structured_output);
    if (!parsed.success) throw new ModelError("invalid", "The answer did not match the schema.");
    return parsed.data as ModelOutput;
  },
};
