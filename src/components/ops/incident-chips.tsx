import { blockLabels, incidentPriorities, incidentStatuses, priorityTone, type BlockKind, type IncidentPriority, type IncidentStatus } from "@/modules/lodging/domain/incidents";

export function PriorityChip({ priority }: { priority: IncidentPriority }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${priorityTone[priority]}`}>{incidentPriorities[priority]}</span>;
}

export function StatusText({ status }: { status: IncidentStatus }) {
  const tone = status === "resolved" ? "text-emerald-700" : status === "cancelled" ? "text-slate-500" : "text-slate-700";
  return <span className={`text-xs font-semibold ${tone}`}>{incidentStatuses[status]}</span>;
}

export function BlockChip({ kind }: { kind: BlockKind }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
      <span aria-hidden>⛔</span>
      {blockLabels[kind]}
    </span>
  );
}
