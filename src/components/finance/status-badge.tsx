import { uiLabel } from "@/lib/ui-labels";
const colors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  submitted: "bg-amber-100 text-amber-800",
  resubmitted: "bg-indigo-100 text-indigo-800",
  under_review: "bg-blue-100 text-blue-800",
  correction_requested: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  scheduled: "bg-purple-100 text-purple-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-700",
  urgent: "bg-red-100 text-red-800",
  normal: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  manufacturing: "bg-blue-100 text-blue-800",
  installation: "bg-indigo-100 text-indigo-800",
  done: "bg-emerald-100 text-emerald-800",
  ai_active: "bg-blue-100 text-blue-800",
  human_required: "bg-amber-100 text-amber-800",
  human_active: "bg-emerald-100 text-emerald-800",
  paused: "bg-slate-200 text-slate-700",
  closed: "bg-gray-200 text-gray-700",
  new: "bg-violet-100 text-violet-800",
  contacted: "bg-blue-100 text-blue-800",
  qualifying: "bg-indigo-100 text-indigo-800",
  qualified: "bg-emerald-100 text-emerald-800",
  quotation_requested: "bg-amber-100 text-amber-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
  discarded: "bg-gray-200 text-gray-700",
};
export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${colors[value] ?? "bg-violet-100 text-violet-800"}`}
    >
      {uiLabel(value)}
    </span>
  );
}
export function LimitExceededBadge() {
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
      Excede límite semanal
    </span>
  );
}
