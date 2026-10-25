import Link from "next/link";
import QRCode from "qrcode";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import { PageHeader, Panel } from "@/components/ui/page";
import { distAssistantContext, loadDistConnection, loadDistSettings } from "@/modules/finance/distribution/assistant/application/queries";

const STATUS: Record<string, { label: string; tone: string }> = {
  disconnected: { label: "Desconectado", tone: "bg-slate-100 text-slate-700" },
  qr_pending: { label: "Esperando escaneo del QR", tone: "bg-amber-50 text-amber-800" },
  connecting: { label: "Conectando…", tone: "bg-sky-50 text-sky-800" },
  connected: { label: "Conectado", tone: "bg-emerald-50 text-emerald-800" },
  error: { label: "Error", tone: "bg-red-50 text-red-700" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const isRecent = (iso: string | null, seconds: number) => Boolean(iso) && Date.now() - new Date(iso!).getTime() < seconds * 1000;

export default async function DistConnectionPage() {
  const { supabase, unit } = await distAssistantContext("distribution.assistant.settings");
  const [{ settings }, connection, { data: qr }] = await Promise.all([
    loadDistSettings(supabase, unit.id),
    loadDistConnection(supabase, unit.id),
    supabase.rpc("dist_wa_connection_qr"),
  ]);
  const qrImage = qr ? await QRCode.toDataURL(qr as string, { margin: 1, width: 320 }) : null;
  const alive = isRecent(connection.heartbeatAt, 180);
  const status = STATUS[connection.status] ?? STATUS.disconnected;
  const name = settings.agent_name || "El asistente";

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Conexión de WhatsApp"
        description={`Vincula el WhatsApp de la distribuidora para que ${name} reciba y responda los pedidos. Se hace igual que WhatsApp Web: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.`}
      />
      <p className="mb-4 text-sm">
        <Link href="/finance/distribution/assistant" className="font-semibold text-[var(--oasis-primary)] underline">
          ← Volver al asistente
        </Link>
      </p>
      <div className="mb-4">
        <LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={5} />
      </div>
      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${alive ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {alive ? "Servicio activo" : "Servicio sin señal"}
          </span>
        </div>
        <dl className="space-y-1 text-sm">
          <div>
            <dt className="inline text-slate-500">Número vinculado: </dt>
            <dd className="inline">{connection.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Última señal del servicio: </dt>
            <dd className="inline">{when(connection.heartbeatAt)}</dd>
          </div>
          {connection.lastError && <div className="text-red-700">Último error: {connection.lastError}</div>}
        </dl>
        {qrImage ? (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el servidor */}
            <img src={qrImage} alt="Código QR para vincular WhatsApp" className="w-64 rounded-xl border" />
            <p className="mt-2 text-xs text-slate-500">El código cambia cada ~20 segundos; esta página se actualiza sola. Generado {when(connection.qrUpdatedAt)}.</p>
          </div>
        ) : (
          !alive && (
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              El servicio de WhatsApp de la distribuidora (worker en Render) no está enviando señal. Cuando esté corriendo, aparecerá aquí el QR para vincular el número.
            </p>
          )
        )}
      </Panel>
    </>
  );
}
