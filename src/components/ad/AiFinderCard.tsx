import { AiRunner } from "@/components/AiRunner";
import { isAiConfigured } from "@/lib/ai/select";
import { FINDING_LABEL, type AiFinding, type AiReview } from "@/lib/ai/types";
import { wordingRecordText } from "@/lib/ai/wording";
import type { AssetView } from "@/lib/data";
import type { Role } from "@/lib/status";
import { Badge, Card } from "./ui";

/**
 * The AI's read of the ad. Three states are kept apart on purpose: a stored
 * result, a result that is incomplete, and no result yet (the reviewer's page
 * starts the read; the marketer's page does not).
 */
export function AiFinderCard({
  asset,
  role,
  aiReview,
  aiOnly,
}: {
  asset: AssetView;
  role: Role;
  aiReview: AiReview | null;
  /** The findings shown: those beyond what the code checks already flag. */
  aiOnly: AiFinding[];
}) {
  const { latest } = asset;
  return (
    <Card title="AI claim finder">
      {latest.wording ? (
        <p
          className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800"
          data-note="wording-checked"
        >
          {wordingRecordText(latest.wording)}
        </p>
      ) : null}
      {aiReview ? (
        <>
          {aiReview.status === "incomplete" ? (
            <div
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">AI review incomplete</p>
              <p className="mt-1">
                {aiReview.reason} Do not read the AI&apos;s answer as a
                full account of this ad. The code checks above are
                complete and still apply.
              </p>
            </div>
          ) : null}
          {aiOnly.length ? (
            <ul className="space-y-3">
              {aiOnly.map((f, i) => (
                <li key={i} className="text-sm">
                  <p className="text-slate-900">
                    <q className="font-medium">{f.quote}</q>{" "}
                    <Badge
                      label={FINDING_LABEL[f.kind]}
                      cls="bg-violet-100 text-violet-900"
                    />
                  </p>
                  <p className="mt-0.5 text-slate-600">{f.why}</p>
                </li>
              ))}
            </ul>
          ) : aiReview.status === "complete" ? (
            <p className="text-sm text-slate-700">
              The AI reported nothing beyond the rate and fee checks
              above. That is not a finding that the ad is fine: an AI
              can miss a claim. Read the wording yourself.
            </p>
          ) : null}
          {aiReview.addressesReviewer ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
              The AI reported that this copy contains text addressed to
              the reviewer or to an AI.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            The AI reads for wording a number check cannot catch. Every
            quote it gives is confirmed to be in the ad, word for word.
            It cannot approve anything: that is your decision.
          </p>
        </>
      ) : role === "reviewer" ? (
        <AiRunner
          key={latest.fingerprint}
          adRef={asset.ref}
          configured={isAiConfigured()}
        />
      ) : (
        <p className="text-sm text-slate-600">
          The AI reads the ad when the reviewer opens it.
        </p>
      )}
    </Card>
  );
}
