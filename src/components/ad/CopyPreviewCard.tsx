import { CopyView, type ExtraMark } from "@/components/CopyView";
import type { AssetView } from "@/lib/data";
import { shortFingerprint } from "@/lib/fingerprint";
import { Card } from "./ui";

/** The ad's words with every flag marked on them, the hidden-text and instruction warnings, and the text's fingerprint. */
export function CopyPreviewCard({ asset, extraMarks }: { asset: AssetView; extraMarks: ExtraMark[] }) {
  const { latest, analysis } = asset;
  return (
    <Card title="Copy preview">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {asset.affiliate.name} · {asset.placement}
        </p>
        <div className="mt-2">
          <CopyView
            id="ad-copy"
            body={latest.body}
            checks={analysis?.checks ?? []}
            extra={extraMarks}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Text only. This preview does not show the layout, how prominent a
        disclosure is, or any sponsorship label on the live placement.
      </p>
      {analysis?.hidden.length ? (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <li className="font-semibold">
            This copy contains text a reader cannot see as written:
          </li>
          {analysis.hidden.map((h) => (
            <li key={h.kind}>{h.label}.</li>
          ))}
        </ul>
      ) : null}
      {asset.instructionText.length ? (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <li className="font-semibold">
            Part of this copy is written to the reviewer or to an AI, not
            to a consumer. It has no effect on the checks or on your
            decision:
          </li>
          {asset.instructionText.map((f, i) => (
            <li key={i}>
              <q>{f.quote}</q> ({f.reason}).
            </li>
          ))}
        </ul>
      ) : null}
      {latest.note ? (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-medium">Marketer&apos;s note:</span>{" "}
          {latest.note}
        </p>
      ) : null}
      <p
        className="mt-3 font-mono text-xs text-slate-500"
        title="A fingerprint of this exact text. An approval is tied to it."
      >
        Text fingerprint {shortFingerprint(latest.fingerprint)}
      </p>
    </Card>
  );
}
