const inputClass =
  "mt-0 flex-1 rounded-xl border border-[#d5dce4] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--oasis-primary)]";

export function InlineDecisionForm({
  action,
  hiddenFields,
  commentName,
  commentRequired,
  commentPlaceholder,
}: {
  action: (formData: FormData) => void;
  hiddenFields: Record<string, string>;
  commentName: string;
  commentRequired?: boolean;
  commentPlaceholder: string;
}) {
  return (
    <form action={action} className="flex min-w-72 flex-col gap-2">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="return_to" value="/admin/approvals" />
      <input
        className={inputClass}
        name={commentName}
        placeholder={commentPlaceholder}
        required={commentRequired}
      />
      <div className="flex gap-2">
        <button
          name="decision"
          value="approved"
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
        >
          Aprobar
        </button>
        <button
          name="decision"
          value="rejected"
          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white"
        >
          Rechazar
        </button>
      </div>
    </form>
  );
}
