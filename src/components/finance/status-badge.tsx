const labels: Record<string, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente",
  under_review: "En revisión",
  correction_requested: "Corrección",
  approved: "Aprobada",
  rejected: "Rechazada",
  scheduled: "Programada",
  paid: "Pagada",
  cancelled: "Anulada",
  normal: "Normal",
  urgent: "Urgente",
};
const colors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  correction_requested: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  scheduled: "bg-purple-100 text-purple-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-700",
  urgent: "bg-red-100 text-red-800",
  normal: "bg-slate-100 text-slate-700",
};
export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${colors[value] ?? "bg-violet-100 text-violet-800"}`}
    >
      {labels[value] ?? value}
    </span>
  );
}
