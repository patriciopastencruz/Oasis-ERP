import QRCode from "qrcode";
import { PageHeader, Panel } from "@/components/ui/page";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import { loadTodayUsage, luciaContext } from "@/modules/lucia/application/queries";
import { LuciaTabs, Notice, Pill, formatDateTime, isRecent } from "@/modules/lucia/ui";

const STATUS: Record<string, { label: string; tone: string }> = {
  disconnected: { label: "Desconectado", tone: "bg-slate-100 text-slate-700" },
  qr_pending: { label: "Esperando escaneo del QR", tone: "bg-amber-50 text-amber-800" },
  connecting: { label: "Conectando…", tone: "bg-sky-50 text-sky-800" },
  connected: { label: "Conectado", tone: "bg-emerald-50 text-emerald-800" },
  error: { label: "Error", tone: "bg-red-50 text-red-700" },
};

export default async function LuciaConnectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.settings.manage");
  const [{ data: qr }, usage, { data: events }] = await Promise.all([
    supabase.rpc("lucia_connection_qr"),
    loadTodayUsage(supabase),
    supabase
      .from("lucia_events")
      .select("id,severity,event_type,message,created_at,conversation_id")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const qrImage = qr ? await QRCode.toDataURL(qr as string, { margin: 1, width: 320 }) : null;
  const workerAlive = isRecent(settings.worker_heartbeat_at, 180);
  const status = STATUS[settings.connection_status] ?? STATUS.disconnected;
  const today = usage.days.find((d) => d.usage_date === usage.today);
  const todayCost = Number(today?.cost_usd ?? 0);
  const budget = Number(settings.daily_budget_usd);

  return (
    <>
      <PageHeader
        eyebrow="Hostales · Lucía"
        title="Conexión de WhatsApp y consumo"
        description="Vincula el número central escaneando el QR desde el teléfono (WhatsApp → Dispositivos vinculados → Vincular un dispositivo) y revisa el gasto diario de Claude."
      />
      <LuciaTabs active="conexion" permissions={ctx.permissions} />
      <Notice success={q.success} error={q.error} />
      <div className="mb-4"><LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={5} /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-semibold">Número central</h2>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone={workerAlive ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}>
              {workerAlive ? "Servicio activo" : "Servicio sin señal"}
            </Pill>
          </div>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-slate-500">Número vinculado: </dt><dd className="inline">{settings.connected_phone ?? "—"}</dd></div>
            <div><dt className="inline text-slate-500">Última señal del servicio: </dt><dd className="inline">{formatDateTime(settings.worker_heartbeat_at)}</dd></div>
            {settings.last_connection_error && (
              <div className="text-red-700">Último error: {settings.last_connection_error}</div>
            )}
          </dl>
          {qrImage ? (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el servidor */}
              <img src={qrImage} alt="Código QR para vincular WhatsApp" className="w-64 rounded-xl border" />
              <p className="mt-2 text-xs text-slate-500">
                El código cambia cada ~20 segundos; esta página se actualiza sola. Generado {formatDateTime(settings.qr_updated_at)}.
              </p>
            </div>
          ) : (
            !workerAlive && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                El servicio de WhatsApp (worker en Railway) no está enviando señal. Cuando esté corriendo aparecerá aquí el QR para vincular el número.
              </p>
            )
          )}
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold">Consumo de Claude</h2>
          <p className="text-2xl font-semibold">US$ {todayCost.toFixed(4)} <span className="text-sm font-normal text-slate-500">hoy de US$ {budget.toFixed(2)}</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${todayCost >= budget ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${budget > 0 ? Math.min(100, (todayCost / budget) * 100) : 100}%` }} />
          </div>
          {settings.budget_exceeded_on === usage.today && (
            <p className="mt-2 text-sm text-red-700">Se superó el tope de hoy: Lucía queda en modo borrador hasta mañana.</p>
          )}
          <table className="mt-4 w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1">Día</th><th>Llamadas</th><th>Entrada</th><th>Caché leído</th><th>Salida</th><th>US$</th></tr>
            </thead>
            <tbody>
              {usage.days.map((d) => (
                <tr key={d.usage_date} className="border-t">
                  <td className="py-1">{d.usage_date}</td>
                  <td>{d.requests}</td>
                  <td>{Number(d.input_tokens) + Number(d.cache_write_tokens)}</td>
                  <td>{d.cache_read_tokens}</td>
                  <td>{d.output_tokens}</td>
                  <td>{Number(d.cost_usd).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel className="mt-4">
        <h2 className="mb-3 font-semibold">Registro de eventos y errores</h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Sin eventos registrados.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap gap-2 py-2">
                <Pill tone={e.severity === "error" ? "bg-red-50 text-red-700" : e.severity === "warning" ? "bg-amber-50 text-amber-800" : undefined}>{e.event_type}</Pill>
                <span className="flex-1">{e.message}</span>
                <span className="text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
