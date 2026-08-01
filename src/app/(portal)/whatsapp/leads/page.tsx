import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { uiLabel } from "@/lib/ui-labels";
import { InboxTabs, inputClass } from "@/modules/whatsapp/ui";
import {
  listLeads,
  listUnitSellers,
  whatsappContext,
} from "@/modules/whatsapp/application/queries";
import { leadStatuses } from "@/modules/whatsapp/domain/lead";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function WhatsAppLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { company, unit, supabase } = await whatsappContext(
    "whatsapp.leads.view",
  );

  const [leads, sellers] = await Promise.all([
    listLeads(supabase, company.id, unit.id, {
      status: q.status,
      city: q.city,
      assigned: q.assigned,
    }),
    listUnitSellers(supabase, company.id, unit.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Leads comerciales"
        description="Prospectos generados por el agente de WhatsApp u otros canales, con su estado de calificación comercial."
      />
      <InboxTabs active="leads" />

      <Panel className="mb-4">
        <form className="grid gap-2 md:grid-cols-5">
          <select className={inputClass} name="status" defaultValue={q.status ?? ""}>
            <option value="">Todos los estados</option>
            {leadStatuses.map((s) => (
              <option key={s} value={s}>
                {uiLabel(s)}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            name="city"
            placeholder="Ciudad"
            defaultValue={q.city}
          />
          <select className={inputClass} name="assigned" defaultValue={q.assigned ?? ""}>
            <option value="">Todos los vendedores</option>
            {sellers.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.first_name} ${m.last_name}`.trim()}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[var(--oasis-primary)] px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[#63778e]">
              <th className="p-2">Nombre</th>
              <th>Teléfono</th>
              <th>Ciudad</th>
              <th>Producto</th>
              <th>Estado</th>
              <th>Última interacción</th>
              <th>Vendedor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b align-top">
                <td className="p-2 font-semibold">{lead.full_name || "Sin nombre"}</td>
                <td className="font-mono text-xs">{lead.phone_e164}</td>
                <td>{lead.city || "—"}</td>
                <td>{uiLabel(lead.product_interest)}</td>
                <td>
                  <StatusBadge value={lead.status} />
                </td>
                <td>{formatDate(lead.last_interaction_at)}</td>
                <td>
                  {lead.assigned
                    ? `${lead.assigned.first_name ?? ""} ${lead.assigned.last_name ?? ""}`.trim()
                    : "—"}
                </td>
                <td>
                  <Link
                    className="font-semibold text-[var(--oasis-primary)] underline"
                    href={`/whatsapp?search=${encodeURIComponent(lead.phone_e164)}`}
                  >
                    Ver conversación
                  </Link>
                </td>
              </tr>
            ))}
            {!leads.length && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[#63778e]">
                  No hay leads para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
