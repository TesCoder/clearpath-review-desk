import { z } from "zod";
import { FINDING_KINDS } from "./types";

/** The only shape the model may answer in. Both model routes use it. */
export const Output = z.object({
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
