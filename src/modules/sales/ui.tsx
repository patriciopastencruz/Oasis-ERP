import Link from "next/link";

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--oasis-primary)]";

export function Notice({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  const message = success || error;
  if (!message) return null;
  return (
    <p
      className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
    >
      {message}
    </p>
  );
}

export function QuotationTabs({ canApprove }: { canApprove: boolean }) {
  const tabs = [
    ["/sales/quotations", "Cotizaciones"],
    ["/sales/quotations/new", "Nueva cotización"],
    ...(canApprove ? [["/sales/quotations/approvals", "Aprobaciones"]] : []),
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[var(--oasis-primary)]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function ProjectListTabs({ canCreate }: { canCreate: boolean }) {
  const tabs = [
    ["/sales/projects", "Proyectos"],
    ...(canCreate ? [["/sales/projects/new", "Nuevo proyecto"]] : []),
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[var(--oasis-primary)]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const PROJECT_DETAIL_TABS = [
  ["resumen", "Resumen"],
  ["gastos", "Gastos"],
  ["resultados", "Estado de resultados"],
  ["equipo", "Equipo"],
  ["documentos", "Documentos"],
  ["observaciones", "Observaciones"],
] as const;
export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number][0];

/**
 * Tabs server-rendered vía `?tab=`, sin JS de cliente — no hay
 * precedente de tabs por entidad en el resto del ERP (Caja Chica usa
 * paneles apilados), así que este es el único componente de UI
 * genuinamente nuevo del módulo.
 */
export function ProjectTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: string;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b text-sm">
      {PROJECT_DETAIL_TABS.map(([key, label]) => (
        <Link
          key={key}
          href={`/sales/projects/${projectId}?tab=${key}`}
          className={`rounded-t-lg px-3 py-2 font-medium ${
            active === key
              ? "border-b-2 border-[var(--oasis-primary)] text-[var(--oasis-primary)]"
              : "text-[#5c6f85] hover:text-[var(--oasis-primary)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
