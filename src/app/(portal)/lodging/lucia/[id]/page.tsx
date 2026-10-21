import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import {
  channelLabels,
  loadConversation,
  loadHostels,
  luciaContext,
  prospectStatusLabels,
} from "@/modules/lucia/application/queries";
import {
  closeConversationAction,
  discardDraftAction,
  markReviewedAction,
  releaseControlAction,
  sendDraftAction,
  sendReplyAction,
  simulateCustomerMessageAction,
  takeControlAction,
  updateProspectAction,
} from "@/modules/lucia/application/actions";
import {
  Notice,
  Pill,
  formatClp,
  formatDateTime,
  inputClass,
  prospectTone,
} from "@/modules/lucia/ui";

const DELIVERY: Record<string, string> = {
  queued: "En cola",
  sending: "Enviando…",
  sent: "Enviado",
  failed: "Falló",
};
const SENDER: Record<string, string> = { customer: "Cliente", lucia: "Lucía", human: "Equipo", system: "Sistema" };
const INTENT: Record<string, string> = {
  greeting: "Saludo",
  faq: "Pregunta frecuente",
  availability: "Disponibilidad",
  price: "Precio",
  booking_intent: "Quiere reservar",
  complaint: "Reclamo",
  out_of_scope: "Fuera del manual",
  other: "Otro",
};

type Person = { first_name?: string; last_name?: string } | null;

export default async function LuciaConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.inbox.view");
  const [{ conversation: c, messages, drafts }, hostels] = await Promise.all([
    loadConversation(supabase, id),
    loadHostels(supabase),
  ]);
  if (!c) notFound();
  const canReply = ctx.permissions.has("lucia.inbox.reply");
  const isSimulator = c.channel === "simulator";
  const closed = c.status === "closed";
  const pending = drafts.find((d) => d.status === "pending");
  const paused = c.paused_until && new Date(c.paused_until) > new Date();
  const hostelName = hostels.find((h) => h.business_unit_id === c.business_unit_id)?.display_name;
  const title = c.guest_name || c.contact_name || c.contact_phone || "Conversación";

  return (
    <>
      <PageHeader
        eyebrow={`Hostales · Lucía · ${channelLabels[c.channel] ?? c.channel}`}
        title={title}
        description={[
          c.contact_phone,
          c.hostel_assigned ? hostelName : "Sin hostal asignada",
          prospectStatusLabels[c.prospect_status],
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <p className="mb-4 text-sm">
        <Link href="/lodging/lucia" className="text-[var(--oasis-primary)] hover:underline">← Volver a prospectos</Link>
      </p>
      <Notice success={q.success} error={q.error} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone={prospectTone(c.prospect_status)}>{prospectStatusLabels[c.prospect_status]}</Pill>
        {c.status === "human" && <Pill>Atiende una persona — Lucía pausada</Pill>}
        {c.status === "lucia" && !paused && <Pill tone="bg-indigo-50 text-indigo-800">{settings.agent_name} redacta borradores</Pill>}
        {paused && <Pill>Lucía en pausa hasta {formatDateTime(c.paused_until)} ({c.pause_reason})</Pill>}
        {c.needs_review && <Pill tone="bg-red-50 text-red-700">{c.review_reason ?? "Requiere revisión"}</Pill>}
        {closed && <Pill>Cerrada</Pill>}
        <div className="ml-auto"><LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={15} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {messages.length === 0 && <p className="text-sm text-slate-500">Aún no hay mensajes.</p>}
              {messages.map((m) => {
                const mine = m.direction === "outbound";
                const sender = (Array.isArray(m.sender) ? m.sender[0] : m.sender) as Person;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-emerald-50" : "bg-slate-100"}`}>
                      <div className="mb-0.5 text-[11px] font-semibold text-slate-500">
                        {SENDER[m.sender_type]}
                        {sender?.first_name ? ` (${sender.first_name})` : ""} · {formatDateTime(m.created_at)}
                        {mine && ` · ${DELIVERY[m.delivery_status] ?? m.delivery_status}`}
                      </div>
                      <div className="whitespace-pre-wrap">
                        {m.message_type === "text" ? m.content : <em>[{m.message_type}] {m.content ?? ""}</em>}
                      </div>
                      {m.error_message && <div className="mt-1 text-xs text-red-600">{m.error_message}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {pending && canReply && !closed && (
            <Panel className="border-indigo-200">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <b>Borrador de {settings.agent_name}</b>
                <Pill tone="bg-indigo-50 text-indigo-800">{INTENT[pending.intent] ?? pending.intent}</Pill>
                {pending.needs_human && <Pill tone="bg-red-50 text-red-700">Pide revisión: {pending.reason ?? "derivar al encargado"}</Pill>}
              </div>
              <form action={sendDraftAction} key={pending.id}>
                <input type="hidden" name="conversation_id" value={c.id} />
                <input type="hidden" name="draft_id" value={pending.id} />
                <textarea name="content" rows={4} defaultValue={pending.content} className={inputClass} />
                <p className="mt-1 text-xs text-slate-500">Puedes editar el texto antes de enviarlo.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">
                    {isSimulator ? "Enviar (simulación)" : "Enviar por WhatsApp"}
                  </button>
                  <button formAction={discardDraftAction} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
                    Descartar
                  </button>
                </div>
              </form>
              <p className="mt-2 text-[11px] text-slate-400">
                {pending.model} · {pending.input_tokens + pending.cache_read_tokens + pending.cache_write_tokens} tokens de entrada
                ({pending.cache_read_tokens} desde caché) · {pending.output_tokens} de salida · US$ {Number(pending.cost_usd).toFixed(4)}
              </p>
            </Panel>
          )}

          {canReply && !closed && (
            <Panel>
              <form action={sendReplyAction} className="space-y-2">
                <input type="hidden" name="conversation_id" value={c.id} />
                <label className="text-sm font-semibold">Responder como equipo{isSimulator ? "" : " (por el número central)"}</label>
                <textarea name="content" rows={3} required className={inputClass} placeholder="Escribe tu respuesta…" />
                <button className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Enviar respuesta</button>
              </form>
            </Panel>
          )}

          {isSimulator && !closed && ctx.permissions.has("lucia.settings.manage") && (
            <Panel className="border-amber-200 bg-amber-50/40">
              <form action={simulateCustomerMessageAction} className="space-y-2">
                <input type="hidden" name="conversation_id" value={c.id} />
                <label className="text-sm font-semibold">Escribir como el cliente (simulador)</label>
                <textarea name="content" rows={2} required className={inputClass} placeholder="Ej: Hola, ¿tienen pieza doble para el viernes?" />
                <button className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
                  Enviar como cliente y pedir borrador a {settings.agent_name}
                </button>
              </form>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          {canReply && !closed && (
            <Panel>
              <h2 className="mb-3 font-semibold">Control del chat</h2>
              <div className="flex flex-wrap gap-2">
                {c.status === "lucia" ? (
                  <form action={takeControlAction}>
                    <input type="hidden" name="conversation_id" value={c.id} />
                    <button className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Tomar control</button>
                  </form>
                ) : null}
                {(c.status === "human" || paused) && (
                  <form action={releaseControlAction}>
                    <input type="hidden" name="conversation_id" value={c.id} />
                    <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Devolver a {settings.agent_name}</button>
                  </form>
                )}
                {c.needs_review && (
                  <form action={markReviewedAction}>
                    <input type="hidden" name="conversation_id" value={c.id} />
                    <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Marcar revisado</button>
                  </form>
                )}
                <form action={closeConversationAction}>
                  <input type="hidden" name="conversation_id" value={c.id} />
                  <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-600">Cerrar</button>
                </form>
              </div>
            </Panel>
          )}

          <Panel>
            <h2 className="mb-3 font-semibold">Ficha del prospecto</h2>
            <form action={updateProspectAction} className="space-y-2 text-sm">
              <input type="hidden" name="conversation_id" value={c.id} />
              <label className="block">Estado
                <select name="prospect_status" defaultValue={c.prospect_status} className={inputClass} disabled={!canReply}>
                  {Object.entries(prospectStatusLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block">Hostal asignada
                <select name="business_unit_id" defaultValue={c.hostel_assigned ? c.business_unit_id : ""} className={inputClass} disabled={!canReply}>
                  <option value="">Sin asignar</option>
                  {hostels.filter((h) => ctx.units.some((u) => u.id === h.business_unit_id)).map((h) => (
                    <option key={h.business_unit_id} value={h.business_unit_id}>{h.display_name}</option>
                  ))}
                </select>
              </label>
              <label className="block">Nombre (WhatsApp)
                <input name="contact_name" defaultValue={c.contact_name ?? ""} className={inputClass} disabled={!canReply} />
              </label>
              <label className="block">Nombre del huésped
                <input name="guest_name" defaultValue={c.guest_name ?? ""} className={inputClass} disabled={!canReply} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Llegada
                  <input type="date" name="check_in" defaultValue={c.check_in ?? ""} className={inputClass} disabled={!canReply} />
                </label>
                <label className="block">Salida
                  <input type="date" name="check_out" defaultValue={c.check_out ?? ""} className={inputClass} disabled={!canReply} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Personas
                  <input type="number" min={1} max={60} name="guests" defaultValue={c.guests ?? ""} className={inputClass} disabled={!canReply} />
                </label>
                <label className="block">Monto cotizado
                  <input type="number" min={0} name="quoted_amount" defaultValue={c.quoted_amount ?? ""} className={inputClass} disabled={!canReply} />
                </label>
              </div>
              <label className="block">Tipo de habitación
                <input name="room_type" defaultValue={c.room_type ?? ""} className={inputClass} disabled={!canReply} />
              </label>
              <label className="block">Preferencias
                <textarea name="preferences" rows={2} defaultValue={c.preferences ?? ""} className={inputClass} disabled={!canReply} />
              </label>
              <p className="text-xs text-slate-500">
                Teléfono: {c.contact_phone ?? "—"} · Cotizado: {formatClp(c.quoted_amount)}
              </p>
              {canReply && (
                <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar ficha</button>
              )}
            </form>
          </Panel>

          {drafts.some((d) => d.status !== "pending") && (
            <Panel>
              <h2 className="mb-2 font-semibold">Borradores anteriores</h2>
              <ul className="space-y-2 text-xs text-slate-600">
                {drafts.filter((d) => d.status !== "pending").slice(0, 8).map((d) => (
                  <li key={d.id} className="border-t pt-2">
                    <b>{{ sent: d.auto_sent ? "Enviado automáticamente" : d.edited ? "Enviado con cambios" : "Enviado", discarded: "Descartado", superseded: "Reemplazado" }[d.status as string] ?? d.status}</b>
                    {" · "}{formatDateTime(d.created_at)}
                    <p className="mt-0.5 line-clamp-3">{d.content}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
