import Link from "next/link";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { PageHeader, Panel } from "@/components/ui/page";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { supportedLuciaModels } from "@/modules/lucia/domain/pricing";
import { resetDistSimulationAction, saveDistSettingsAction, simulateDistMessageAction } from "@/modules/finance/distribution/assistant/application/actions";
import {
  distAssistantContext,
  loadActingCandidates,
  loadAssistantEvents,
  loadAssistantOrders,
  loadDistConnection,
  loadDistSettings,
  loadSimulation,
  loadUsageToday,
} from "@/modules/finance/distribution/assistant/application/queries";
import { Notice, inputClass } from "@/modules/whatsapp/ui";

const WEEKDAYS = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [7, "Dom"],
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  assigned: "Asignado",
  en_route: "En camino",
  delivered: "Entregado",
  partially_delivered: "Entrega parcial",
  not_delivered: "No entregado",
  rescheduled: "Reprogramado",
  cancelled: "Cancelado",
  voided: "Anulado",
};

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function DistAssistantPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distAssistantContext("distribution.assistant.view");
  const canSettings = ctx.permissions.has("distribution.assistant.settings");
  const today = santiagoToday();
  const [{ settings, configured }, orders, events, usage, candidates, simulation, connection] = await Promise.all([
    loadDistSettings(supabase, unit.id),
    loadAssistantOrders(supabase, unit.id),
    loadAssistantEvents(supabase, unit.id),
    loadUsageToday(supabase, unit.id, today),
    canSettings ? loadActingCandidates(unit.id) : Promise.resolve([]),
    canSettings ? loadSimulation(supabase, unit.id, ctx.user.id) : Promise.resolve({ conversation: null, messages: [] }),
    loadDistConnection(supabase, unit.id),
  ]);
  const connected = connection.status === "connected";
  const name = settings.agent_name || "El asistente";

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Asistente de pedidos por WhatsApp"
        description={`${name} toma los pedidos de hielo y agua de tus clientes, los carga en el ERP y avisa al encargado. Prueba cómo responde en el simulador antes de conectarlo a WhatsApp.`}
      />
      <Notice success={q.success} error={q.error} />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
          <p className={`mt-1 text-xl font-bold ${settings.enabled ? "text-emerald-700" : "text-amber-700"}`}>{settings.enabled ? "Activado" : "Desactivado"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {!configured ? (
              "Configúralo abajo para empezar."
            ) : connected ? (
              <>
                WhatsApp conectado ({connection.phone ?? "sin número"}).{" "}
                {canSettings && (
                  <Link href="/finance/distribution/assistant/conexion" className="font-semibold underline">
                    Ver conexión
                  </Link>
                )}
              </>
            ) : (
              <>
                Sin WhatsApp conectado: solo funciona el simulador.{" "}
                {canSettings && (
                  <Link href="/finance/distribution/assistant/conexion" className="font-semibold underline">
                    Conectar
                  </Link>
                )}
              </>
            )}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Consumo de Claude hoy</p>
          <p className="mt-1 text-xl font-bold">US$ {usage.cost.toFixed(4)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {usage.requests} llamadas · tope diario US$ {settings.daily_budget_usd.toFixed(2)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pedidos tomados por el asistente</p>
          <p className="mt-1 text-xl font-bold">{orders.length}</p>
          <p className="mt-1 text-xs text-slate-500">Los últimos 15 aparecen abajo.</p>
        </Panel>
      </div>

      {canSettings && (
        <Panel className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Simulador</h2>
            {simulation.conversation && (
              <form action={resetDistSimulationAction}>
                <button className="text-xs font-semibold text-slate-600 underline">Empezar otra conversación</button>
              </form>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Escribe como si fueras un cliente. El asistente usa los mismos precios y reglas que usará en WhatsApp, pero <b>nunca deja un pedido en el ERP</b>: el número de pedido que ves en la prueba es solo de ejemplo.
          </p>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto rounded-xl border border-[#e3e8ee] bg-slate-50 p-3">
            {simulation.messages.length === 0 && <p className="text-sm text-slate-500">Aún no hay mensajes. Escribe el primero abajo.</p>}
            {simulation.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "inbound" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direction === "inbound" ? "bg-[#d9fdd3]" : "bg-white shadow-sm"}`}>{m.content}</p>
              </div>
            ))}
          </div>
          {simulation.conversation?.needs_review && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">El asistente pidió ayuda del encargado: {simulation.conversation.review_reason ?? "sin motivo"}.</p>
          )}
          <form action={simulateDistMessageAction} className="mt-3 grid gap-2 md:grid-cols-[1fr_200px_auto]">
            <input name="content" required maxLength={1000} placeholder="Ej.: hola, necesito 20 bolsas de hielo de 2 kg para mañana" className={inputClass} />
            <input name="contact_phone" defaultValue={simulation.conversation?.contact_phone ?? ""} placeholder="Teléfono del cliente (opcional)" className={inputClass} />
            <button className="mt-1.5 rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">Enviar</button>
          </form>
          <p className="mt-1 text-xs text-slate-500">
            Para probar con un cliente real, escribe su teléfono (el asistente lo reconoce y usa sus precios). Sin teléfono se comporta como un cliente no registrado.
          </p>
        </Panel>
      )}

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="font-semibold">Pedidos tomados por el asistente</h2>
        {orders.length ? (
          <table className="mt-3 w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1.5">Pedido</th>
                <th>Cliente</th>
                <th>Entrega</th>
                <th>Estado</th>
                <th className="text-right">Total</th>
                <th>Tomado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 font-medium">{o.number}</td>
                  <td>
                    {o.customer}
                    {o.customerCreated && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">cliente nuevo</span>}
                  </td>
                  <td>{o.date}</td>
                  <td>{STATUS_LABEL[o.status] ?? o.status}</td>
                  <td className="text-right tabular-nums">{clp(o.total)}</td>
                  <td className="text-slate-500">{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay pedidos tomados por el asistente.</p>
        )}
      </Panel>

      {events.length > 0 && (
        <Panel className="mb-4">
          <h2 className="font-semibold">Avisos y errores recientes</h2>
          <ul className="mt-2 divide-y text-sm">
            {events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className={e.severity === "error" ? "text-red-700" : e.severity === "warning" ? "text-amber-800" : ""}>{e.message}</span>
                <span className="shrink-0 text-xs text-slate-500">{when(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {canSettings && (
        <Panel>
          <h2 className="font-semibold">Ajustes</h2>
          <form action={saveDistSettingsAction} className="mt-3 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                Nombre del asistente
                <input name="agent_name" required maxLength={60} defaultValue={settings.agent_name} placeholder="Ej.: el nombre que le pondrás" className={inputClass} />
              </label>
              <label className="block text-sm">
                Pedidos a nombre de
                <select name="acting_user_id" defaultValue={settings.acting_user_id ?? ""} className={inputClass}>
                  <option value="">Elige un usuario…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.job}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Los pedidos y clientes que cree el asistente quedan a nombre de este usuario. Conviene crear uno propio, por ejemplo «Asistente de pedidos».</span>
              </label>
            </div>
            <div>
              <p className="text-sm">Días de reparto</p>
              <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                {WEEKDAYS.map(([n, label]) => (
                  <label key={n} className="flex items-center gap-1.5">
                    <input type="checkbox" name="delivery_weekdays" value={n} defaultChecked={settings.delivery_weekdays.includes(n)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="block text-sm">
                Hora límite del mismo día
                <input type="time" name="same_day_cutoff" required defaultValue={settings.same_day_cutoff} className={inputClass} />
              </label>
              <label className="block text-sm">
                Máx. unidades por producto
                <input name="max_quantity_per_line" inputMode="numeric" required defaultValue={settings.max_quantity_per_line} className={inputClass} />
              </label>
              <label className="block text-sm">
                Máx. total por pedido (CLP)
                <input name="max_order_total" inputMode="numeric" required defaultValue={settings.max_order_total} className={inputClass} />
              </label>
              <label className="block text-sm">
                Tope diario de Claude (US$)
                <input name="daily_budget_usd" inputMode="decimal" required defaultValue={settings.daily_budget_usd} className={inputClass} />
              </label>
            </div>
            <p className="-mt-2 text-xs text-slate-500">Si un pedido supera los máximos, el asistente no lo carga: avisa al encargado para que lo revise.</p>
            <label className="block text-sm">
              Números del encargado (uno por línea, formato +569XXXXXXXX)
              <textarea name="notify_phones" rows={2} defaultValue={settings.notify_phones.join("\n")} className={inputClass} />
              <span className="mt-1 block text-xs text-slate-500">Recibirán el aviso de cada pedido por WhatsApp cuando se conecte el número (próxima etapa). Hoy el aviso llega dentro del ERP.</span>
            </label>
            <label className="block text-sm">
              Números que el asistente nunca atiende (uno por línea, formato +569XXXXXXXX)
              <textarea name="ignored_phones" rows={2} defaultValue={settings.ignored_phones.join("\n")} className={inputClass} />
              <span className="mt-1 block text-xs text-slate-500">Equipo, proveedores, familia u otros contactos del WhatsApp de la distribuidora: sus mensajes no se guardan ni se responden.</span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                Pausa cuando el equipo escribe desde el teléfono (minutos)
                <input name="pause_minutes" inputMode="numeric" required defaultValue={settings.pause_minutes} className={inputClass} />
                <span className="mt-1 block text-xs text-slate-500">Si alguien del equipo contesta a un cliente, el asistente se calla en ese chat este tiempo.</span>
              </label>
              <label className="block text-sm">
                Máx. mensajes por minuto
                <input name="max_messages_per_minute" inputMode="numeric" required defaultValue={settings.max_messages_per_minute} className={inputClass} />
              </label>
            </div>
            <label className="block text-sm">
              Instrucciones adicionales (opcional)
              <textarea name="general_instructions" rows={4} defaultValue={settings.general_instructions} placeholder="Cosas del negocio que el asistente debe saber: zonas, horarios, trato con los clientes…" className={inputClass} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                Modelo de Claude
                <select name="model" defaultValue={settings.model} className={inputClass}>
                  {supportedLuciaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
                <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
                Asistente activado (responde en WhatsApp cuando esté conectado)
              </label>
            </div>
            <ConfirmButton message="¿Guardar los ajustes del asistente?" className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">
              Guardar ajustes
            </ConfirmButton>
          </form>
        </Panel>
      )}
    </>
  );
}
