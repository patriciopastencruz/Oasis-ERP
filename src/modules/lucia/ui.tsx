import Link from "next/link";

export { Notice, inputClass } from "@/modules/whatsapp/ui";

const TABS = [
  ["", "Prospectos", "lucia.inbox.view"],
  ["preguntas", "Preguntas a recepción", "lucia.inbox.view"],
  ["simulador", "Simulador", "lucia.settings.manage"],
  ["fotos", "Fotos", "lucia.settings.manage"],
  ["conexion", "Conexión y consumo", "lucia.settings.manage"],
  ["configuracion", "Configuración", "lucia.settings.manage"],
] as const;

export function LuciaTabs({
  active,
  permissions,
}: {
  active: string;
  permissions: Set<string>;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {TABS.filter(([, , permission]) => permissions.has(permission)).map(([key, label]) => (
        <Link
          key={key}
          href={key ? `/lodging/lucia/${key}` : "/lodging/lucia"}
          className={`rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[var(--oasis-primary)] ${
            active === key ? "border-[var(--oasis-primary)] text-[var(--oasis-primary)]" : ""
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const PROSPECT_COLORS: Record<string, string> = {
  new: "bg-sky-50 text-sky-800",
  quoted: "bg-amber-50 text-amber-800",
  pre_reserved: "bg-violet-50 text-violet-800",
  confirmed: "bg-emerald-50 text-emerald-800",
  lost: "bg-slate-100 text-slate-600",
};

export function Pill({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone ?? "bg-slate-100 text-slate-700"}`}>
      {children}
    </span>
  );
}

export function prospectTone(status: string) {
  return PROSPECT_COLORS[status];
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${d}-${m}-${y}`;
}

export function formatClp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/** true si la marca de tiempo tiene menos de `seconds` segundos. */
export function isRecent(value: string | null | undefined, seconds: number) {
  return Boolean(value) && Date.now() - new Date(value!).getTime() < seconds * 1000;
}
