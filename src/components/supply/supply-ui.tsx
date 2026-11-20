import { statusTone } from "@/modules/inventory/supply/domain/supply";

export const field =
  "w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--oasis-primary)]";

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status] ?? "bg-slate-100 text-slate-700"}`}>
      {label}
    </span>
  );
}
