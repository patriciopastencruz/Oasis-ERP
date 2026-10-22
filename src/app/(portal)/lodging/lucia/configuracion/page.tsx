import { PageHeader, Panel } from "@/components/ui/page";
import { loadHostels, luciaContext } from "@/modules/lucia/application/queries";
import {
  addExcludedContactAction,
  removeExcludedContactAction,
  saveHostelAction,
  saveSettingsAction,
} from "@/modules/lucia/application/actions";
import { supportedLuciaModels } from "@/modules/lucia/domain/pricing";
import { LuciaTabs, Notice, inputClass } from "@/modules/lucia/ui";

const CATEGORY: Record<string, string> = { familia: "Familia", equipo: "Equipo", encargado: "Encargado", otro: "Otro" };

export default async function LuciaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.settings.manage");
  const [hostels, { data: excluded }] = await Promise.all([
    loadHostels(supabase),
    supabase.from("lucia_excluded_contacts").select("id,phone_e164,label,category").order("label"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Hostales · Lucía"
        title="Configuración de Lucía"
        description="Instrucciones, manuales por hostal, encargados, contactos excluidos y tope de gasto. La clave de Claude no se guarda aquí: vive solo en las variables de entorno del servidor."
      />
      <LuciaTabs active="configuracion" permissions={ctx.permissions} />
      <Notice success={q.success} error={q.error} />

      <Panel className="mb-4">
        <h2 className="mb-3 font-semibold">General</h2>
        <form action={saveSettingsAction} className="grid gap-3 md:grid-cols-3">
          <input type="hidden" name="settings_id" value={settings.id} />
          <label className="text-sm">Nombre de la asistente
            <input name="agent_name" defaultValue={settings.agent_name} required className={inputClass} />
          </label>
          <label className="text-sm">Modelo de Claude
            <select name="model" defaultValue={settings.model} className={inputClass}>
              {supportedLuciaModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-sm">Tope de gasto diario (US$)
            <input type="number" step="0.01" min={0} max={1000} name="daily_budget_usd" defaultValue={settings.daily_budget_usd} className={inputClass} />
          </label>
          <label className="text-sm">Máximo de mensajes enviados por minuto
            <input type="number" min={1} max={30} name="max_messages_per_minute" defaultValue={settings.max_messages_per_minute} className={inputClass} />
          </label>
          <label className="text-sm">Mensajes de contexto por conversación
            <input type="number" min={1} max={50} name="history_messages" defaultValue={settings.history_messages} className={inputClass} />
          </label>
          <label className="text-sm md:col-span-3">Instrucciones generales de Lucía
            <textarea name="general_instructions" rows={8} defaultValue={settings.general_instructions} className={inputClass}
              placeholder="Tono, cómo saludar, políticas comunes a las tres hostales (check-in, mascotas, formas de pago)…" />
          </label>
          <div className="md:col-span-3">
            <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar</button>
          </div>
        </form>
      </Panel>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        {hostels.map((h) => (
          <Panel key={h.business_unit_id}>
            <h2 className="mb-3 font-semibold">{h.display_name} <span className="text-xs text-slate-500">({h.code})</span></h2>
            <form action={saveHostelAction} className="space-y-3 text-sm">
              <input type="hidden" name="business_unit_id" value={h.business_unit_id} />
              <label className="block">Nombre que usa Lucía
                <input name="display_name" defaultValue={h.display_name} required className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Encargado
                  <input name="manager_name" defaultValue={h.manager_name ?? ""} className={inputClass} />
                </label>
                <label className="block">WhatsApp del encargado
                  <input name="manager_phone" defaultValue={h.manager_phone ?? ""} placeholder="+56 9 ..." className={inputClass} />
                </label>
              </div>
              <label className="block">WhatsApp del administrador (opcional)
                <input name="admin_phone" defaultValue={h.admin_phone ?? ""} placeholder="+56 9 ..." className={inputClass} />
                <span className="text-xs text-slate-500">Recibe los mismos avisos que el encargado y también puede responder OK o NO, por ejemplo fuera del horario de recepción. Vale la primera respuesta.</span>
              </label>
              <label className="block">Modo
                <select name="mode" defaultValue={h.mode} className={inputClass}>
                  <option value="draft">Borrador (una persona aprueba cada mensaje)</option>
                  <option value="auto">Automático (Lucía responde sola)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="enabled" defaultChecked={h.enabled} /> Lucía ofrece esta hostal
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Abono (% del total)
                  <input type="number" min={1} max={100} name="deposit_percent" defaultValue={h.deposit_percent} className={inputClass} />
                </label>
                <label className="block">Guardar habitación (minutos)
                  <input type="number" min={15} max={1440} name="hold_minutes" defaultValue={h.hold_minutes} className={inputClass} />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="full_payment_single_night" defaultChecked={h.full_payment_single_night} /> Reservas de 1 noche se pagan completas
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Check-in desde
                  <input type="time" name="checkin_time" defaultValue={h.checkin_time.slice(0, 5)} className={inputClass} />
                </label>
                <label className="block">Check-out hasta
                  <input type="time" name="checkout_time" defaultValue={h.checkout_time.slice(0, 5)} className={inputClass} />
                </label>
              </div>
              <label className="block">Link del álbum de fotos (se envía al confirmar la reserva)
                <input type="url" name="photos_url" defaultValue={h.photos_url ?? ""} placeholder="https://…" className={inputClass} />
              </label>
              <label className="block">Datos para transferencia
                <textarea name="payment_instructions" rows={5} defaultValue={h.payment_instructions} className={inputClass}
                  placeholder="Banco, tipo y número de cuenta, RUT, nombre y correo. Lucía los envía al cliente solo cuando recepción confirma la disponibilidad." />
              </label>
              <label className="block">Manual de la hostal
                <textarea name="manual" rows={12} defaultValue={h.manual} className={inputClass}
                  placeholder="Dirección, horarios de check-in/out, desayuno, estacionamiento, wifi, políticas, cómo llegar, preguntas frecuentes…" />
              </label>
              <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar {h.code}</button>
            </form>
          </Panel>
        ))}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        En modo automático Lucía envía sola sus respuestas. Cuando no tiene el dato (disponibilidad, reservas, reclamos, temas fuera del manual)
        responde que el encargado confirmará y marca el chat para revisión. No responde sola en chats tomados, pausados (el equipo respondió desde
        el teléfono o la bandeja en las últimas 12 h), audios e imágenes, ni después de superar el tope de gasto del día.
        Un chat sin hostal asignada se responde solo si todas las hostales habilitadas están en automático.
      </p>

      <Panel>
        <h2 className="mb-1 font-semibold">Contactos excluidos</h2>
        <p className="mb-3 text-sm text-slate-500">Familia, equipo y encargados: Lucía ignora por completo sus mensajes (ni siquiera se guardan).</p>
        <form action={addExcludedContactAction} className="mb-4 grid gap-2 md:grid-cols-4">
          <input name="phone" required placeholder="+56 9 1234 5678" className={inputClass} />
          <input name="label" required placeholder="Nombre" className={inputClass} />
          <select name="category" defaultValue="familia" className={inputClass}>
            {Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="mt-1.5 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Agregar</button>
        </form>
        {(excluded ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No hay contactos excluidos.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(excluded ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span><b>{e.label}</b> · {e.phone_e164} · {CATEGORY[e.category]}</span>
                <form action={removeExcludedContactAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="text-xs font-semibold text-red-700 hover:underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
