import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import {
  channelLabels,
  loadHostels,
  loadInbox,
  luciaContext,
  prospectStatusLabels,
  type InboxFilters,
} from "@/modules/lucia/application/queries";
import {
  LuciaTabs,
  Notice,
  Pill,
  formatClp,
  formatDate,
  formatDateTime,
  inputClass,
  prospectTone,
} from "@/modules/lucia/ui";

const VIEWS: { key: InboxFilters["view"] | ""; label: string }[] = [
  { key: "", label: "Activos" },
  { key: "revision", label: "Requieren revisión" },
  { key: "seguimiento", label: "Seguimiento (cotizados sin respuesta 24 h)" },
  { key: "cerrados", label: "Cerrados" },
];

export default async function LuciaInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.inbox.view");
  const view = (VIEWS.find((v) => v.key === q.view)?.key || undefined) as InboxFilters["view"];
  const [hostels, rows] = await Promise.all([
    loadHostels(supabase),
    loadInbox(supabase, { view, prospect: q.prospect, hostel: q.hostel, channel: q.channel }),
  ]);
  const hostelName = new Map(hostels.map((h) => [h.business_unit_id, h.display_name]));
  const filterHref = (key: string) => {
    const params = new URLSearchParams();
    if (key) params.set("view", key);
    for (const name of ["prospect", "hostel", "channel"] as const) if (q[name]) params.set(name, q[name]!);
    return `/lodging/lucia${params.size ? `?${params}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Hostales · Lucía"
        title="Prospectos de WhatsApp"
        description={`Conversaciones del número central atendidas por ${settings.agent_name}. En esta etapa Lucía solo sugiere respuestas: nada se envía sin que alguien presione "Enviar".`}
      />
      <LuciaTabs active="" permissions={ctx.permissions} />
      <Notice success={q.success} error={q.error} />
      {settings.budget_exceeded_on && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Lucía superó el tope de gasto diario el {formatDate(settings.budget_exceeded_on)}.
        </p>
      )}

      <nav className="mb-3 flex flex-wrap gap-2 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={filterHref(v.key ?? "")}
            className={`rounded-xl border px-3 py-1.5 ${(view ?? "") === v.key ? "border-[var(--oasis-primary)] bg-[var(--oasis-primary)] text-white" : "bg-white"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <Panel className="mb-4">
        <form className="grid gap-2 md:grid-cols-4">
          {view && <input type="hidden" name="view" value={view} />}
          <select name="prospect" defaultValue={q.prospect ?? ""} className={inputClass}>
            <option value="">Todos los estados</option>
            {Object.entries(prospectStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select name="hostel" defaultValue={q.hostel ?? ""} className={inputClass}>
            <option value="">Todas las hostales</option>
            <option value="sin_asignar">Sin hostal asignada</option>
            {hostels.map((h) => (
              <option key={h.business_unit_id} value={h.business_unit_id}>{h.display_name}</option>
            ))}
          </select>
          <select name="channel" defaultValue={q.channel ?? ""} className={inputClass}>
            <option value="">Todos los canales</option>
            {Object.entries(channelLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button className="mt-1.5 rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No hay conversaciones con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th>Estado</th>
                  <th>Hostal</th>
                  <th>Fechas / personas</th>
                  <th>Cotizado</th>
                  <th>Último mensaje</th>
                  <th>Atención</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pending = row.pending_drafts?.[0]?.count ?? 0;
                  const paused = row.paused_until && new Date(row.paused_until) > new Date();
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="py-3">
                        <Link href={`/lodging/lucia/${row.id}`} className="font-semibold text-[var(--oasis-primary)] hover:underline">
                          {row.guest_name || row.contact_name || row.contact_phone || "Sin nombre"}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {row.contact_phone ?? ""} · {channelLabels[row.channel] ?? row.channel}
                        </div>
                      </td>
                      <td><Pill tone={prospectTone(row.prospect_status)}>{prospectStatusLabels[row.prospect_status]}</Pill></td>
                      <td>{row.hostel_assigned ? hostelName.get(row.business_unit_id) : <span className="text-slate-400">Sin asignar</span>}</td>
                      <td>
                        {row.check_in ? `${formatDate(row.check_in)} → ${formatDate(row.check_out)}` : "—"}
                        {row.guests ? ` · ${row.guests} pers.` : ""}
                      </td>
                      <td>{formatClp(row.quoted_amount)}</td>
                      <td className="text-xs">{formatDateTime(row.last_message_at)}</td>
                      <td className="space-y-1">
                        {pending > 0 && <div><Pill tone="bg-indigo-50 text-indigo-800">Borrador listo</Pill></div>}
                        {row.needs_review && <div><Pill tone="bg-red-50 text-red-700">{row.review_reason ?? "Revisar"}</Pill></div>}
                        {row.status === "human" && <div><Pill>Atiende una persona</Pill></div>}
                        {paused && <div><Pill>Lucía en pausa</Pill></div>}
                        {row.unanswered_since && row.status !== "closed" && (
                          <div className="text-xs text-slate-500">Sin respuesta desde {formatDateTime(row.unanswered_since)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="mt-4">
        <LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={20} />
      </div>
    </>
  );
}
