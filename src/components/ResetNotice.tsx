/** Shown once after Reset demo, on whichever list the visitor lands on. */
export function ResetNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900" role="status">
      Your demo workspace is back to its starting ads.
    </p>
  );
}
