import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { uiLabel } from "@/lib/ui-labels";
import { InboxTabs, Notice, inputClass } from "@/modules/whatsapp/ui";
import {
  loadInbox,
  whatsappContext,
  type InboxFilterKey,
} from "@/modules/whatsapp/application/queries";

const FILTERS: { key: InboxFilterKey | ""; label: string }[] = [
  { key: "", label: "Activas" },
  { key: "nuevas", label: "Nuevas" },
  { key: "ia", label: "IA respondiendo" },
  { key: "requieren_humano", label: "Requieren vendedor" },
  { key: "mias", label: "Asignadas a mí" },
  { key: "cerradas", label: "Cerradas" },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function WhatsAppInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, company, supabase } = await whatsappContext(
    "whatsapp.inbox.view",
  );

  const status = (q.status as InboxFilterKey | undefined) || undefined;
  const conversations = await loadInbox(supabase, company.id, unit.id, ctx.user.id, {
    status,
    search: q.search,
  });

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Conversaciones de WhatsApp"
        description="Bandeja compartida de conversaciones atendidas por el agente comercial de WhatsApp o por el equipo de ventas."
      />
      <InboxTabs active="" />
      <Notice success={q.success} error={q.error} />

      <Panel className="mb-4">
        <form className="grid gap-2 md:grid-cols-6">
          <input
            className={`${inputClass} md:col-span-2`}
            name="search"
            placeholder="Buscar por nombre, teléfono o ciudad"
            defaultValue={q.search}
          />
          <select className={inputClass} name="status" defaultValue={q.status ?? ""}>
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[var(--oasis-primary)] px-4 text-sm font-semibold text-white md:col-span-1">
            Filtrar
          </button>
        </form>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[#63778e]">
              <th className="p-2">Nombre</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Producto</th>
              <th>Estado</th>
              <th>Último mensaje</th>
              <th>Responsable</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id} className="border-b align-top">
                <td className="p-2 font-semibold">
                  {c.lead?.full_name || "Sin nombre"}
                </td>
                <td className="font-mono text-xs">{c.lead?.phone_e164 ?? "—"}</td>
                <td>{c.lead?.city || "—"}</td>
                <td>{uiLabel(c.lead?.product_interest)}</td>
                <td>
                  <StatusBadge value={c.status} />
                  {c.requires_human && (
                    <span className="ml-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      Urgente
                    </span>
                  )}
                </td>
                <td>{formatDateTime(c.last_message_at)}</td>
                <td>
                  {c.assigned
                    ? `${c.assigned.first_name ?? ""} ${c.assigned.last_name ?? ""}`.trim()
                    : "—"}
                </td>
                <td>
                  <Link
                    className="font-semibold text-[var(--oasis-primary)] underline"
                    href={`/whatsapp/${c.id}`}
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {!conversations.length && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[#63778e]">
                  No hay conversaciones para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
