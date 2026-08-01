import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { InboxTabs, Notice, inputClass } from "@/modules/whatsapp/ui";
import {
  loadIntegration,
  loadRecentEvents,
  whatsappContext,
} from "@/modules/whatsapp/application/queries";
import {
  testConnectionAction,
  updateIntegrationAction,
} from "@/modules/whatsapp/application/settings-actions";

function formatDateTime(value: string | null) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
}

function envStatus(name: string) {
  const configured = Boolean(process.env[name]);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {name}: {configured ? "configurada" : "no configurada"}
    </span>
  );
}

export default async function WhatsAppSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { company, unit, supabase } = await whatsappContext(
    "whatsapp.settings.manage",
  );

  const [integration, events] = await Promise.all([
    loadIntegration(supabase, company.id, unit.id),
    loadRecentEvents(supabase, company.id),
  ]);

  const provider = process.env.WHATSAPP_PROVIDER || "twilio";

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Configuración de WhatsApp"
        description="Estado de la integración, automatización del agente y credenciales (definidas solo por variables de entorno)."
      />
      <InboxTabs />
      <Notice success={q.success} error={q.error} />

      {!integration ? (
        <Panel>
          <p className="text-sm text-[#63778e]">
            No hay una integración registrada para esta unidad todavía. Debe
            crearse una fila en <code>whatsapp_integrations</code> apuntando a
            la unidad OM (ver <code>docs/whatsapp-agent.md</code>).
          </p>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#63778e]">
              Integración
            </h2>
            <form action={updateIntegrationAction} className="grid gap-3">
              <input type="hidden" name="integration_id" value={integration.id} />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-[#63778e]">Proveedor</p>
                  <p className="font-semibold uppercase">{provider}</p>
                </div>
                <div>
                  <p className="text-xs text-[#63778e]">Estado de conexión</p>
                  <StatusBadge value={integration.connection_status} />
                </div>
                <div>
                  <p className="text-xs text-[#63778e]">Último webhook recibido</p>
                  <p className="text-sm">{formatDateTime(integration.last_webhook_at)}</p>
                </div>
              </div>

              <label className="text-sm font-medium">
                Número (E.164, ej. +14155238886)
                <input
                  className={`${inputClass} font-mono`}
                  name="phone_number_e164"
                  defaultValue={integration.phone_number_e164}
                  required
                />
              </label>
              <label className="text-sm font-medium">
                Nombre para mostrar
                <input
                  className={inputClass}
                  name="display_name"
                  defaultValue={integration.display_name ?? ""}
                />
              </label>
              <label className="text-sm font-medium">
                Nombre del agente
                <input
                  className={inputClass}
                  name="agent_name"
                  defaultValue={integration.agent_name}
                  required
                />
              </label>
              <label className="text-sm font-medium">
                Mensaje de respaldo (cuando la IA falla o está desactivada)
                <textarea
                  className={inputClass}
                  name="fallback_message"
                  rows={3}
                  defaultValue={integration.fallback_message}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={integration.enabled}
                  />
                  Recibir mensajes (integración activa)
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="automation_enabled"
                    defaultChecked={integration.automation_enabled}
                  />
                  Automatización del agente IA activa
                </label>
              </div>
              <div>
                <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
                  Guardar configuración
                </button>
              </div>
            </form>

            <form action={testConnectionAction} className="mt-4 border-t pt-4">
              <input type="hidden" name="integration_id" value={integration.id} />
              <button className="rounded-xl border border-[#d5dce4] px-4 py-2.5 text-sm font-semibold hover:border-[var(--oasis-primary)]">
                Probar conexión
              </button>
              {integration.last_connection_error && (
                <p className="mt-2 text-xs text-red-700">
                  Último error: {integration.last_connection_error}
                </p>
              )}
              {integration.last_connection_check_at && (
                <p className="mt-1 text-xs text-[#63778e]">
                  Última verificación: {formatDateTime(integration.last_connection_check_at)}
                </p>
              )}
            </form>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#63778e]">
                Variables de entorno
              </h2>
              <p className="mb-3 text-xs text-[#63778e]">
                Los secretos nunca se muestran ni se editan aquí; solo se
                indica si están definidos en el servidor.
              </p>
              <div className="flex flex-wrap gap-2">
                {envStatus("TWILIO_ACCOUNT_SID")}
                {envStatus("TWILIO_AUTH_TOKEN")}
                {envStatus("ANTHROPIC_API_KEY")}
              </div>
            </Panel>

            <Panel>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#63778e]">
                Eventos recientes
              </h2>
              <ul className="flex flex-col gap-2 text-xs">
                {events.map((e) => (
                  <li key={e.id} className="border-b pb-2 last:border-0">
                    <p className="font-semibold">{e.event_type}</p>
                    <p className="text-[#63778e]">{e.message}</p>
                    <p className="text-[#9aa7b4]">{formatDateTime(e.created_at)}</p>
                  </li>
                ))}
                {!events.length && (
                  <li className="text-[#63778e]">Sin eventos registrados.</li>
                )}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
