/**
 * The ad text as it is stored. Line endings only: the words are kept exactly
 * as typed, hidden characters included, so the reviewer sees and fingerprints
 * what was submitted. The wording check uses the same function, so a draft
 * that was checked and then submitted has the same fingerprint both times.
 */
export function cleanBody(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}
