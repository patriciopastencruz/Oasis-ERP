export const taskStatuses = ["pending", "in_progress", "done"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskColumns: { status: TaskStatus; label: string }[] = [
  { status: "pending", label: "Pendiente" },
  { status: "in_progress", label: "En ejecución" },
  { status: "done", label: "Terminado" },
];

export function isOverdue(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === "done") return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}
