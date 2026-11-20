import { createHash } from "node:crypto";

/** SHA-256 of the exact submitted text. An approval is bound to this value. */
export function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function shortFingerprint(fp: string): string {
  return fp.slice(0, 8);
}
