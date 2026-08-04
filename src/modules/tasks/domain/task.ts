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

// Paleta de respaldo para unidades sin color asignado manualmente: mismo
// código siempre cae en el mismo color, así el tablero es legible desde el
// primer momento aunque nadie haya configurado colores todavía.
const fallbackPalette = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];
export function unitColor(unit: { id: string; color?: string | null } | null) {
  if (!unit) return null;
  if (unit.color) return unit.color;
  let hash = 0;
  for (let i = 0; i < unit.id.length; i++) hash = (hash * 31 + unit.id.charCodeAt(i)) >>> 0;
  return fallbackPalette[hash % fallbackPalette.length];
}
