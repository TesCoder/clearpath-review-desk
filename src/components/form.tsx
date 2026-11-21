// Pieces every form on the desk shares.

/** The look of a text input, a select and a date field. */
export const FIELD =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600";

/** The look of a multi-line box. */
export const TEXT_BOX =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600";

/** What the server said when it refused a form, announced to screen readers. Renders nothing when there is no error. */
export function FormError({ error, className = "" }: { error: string | null; className?: string }) {
  if (!error) return null;
  return (
    <p className={`${className ? className + " " : ""}rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900`} role="alert">
      {error}
    </p>
  );
}
