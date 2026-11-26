import Link from "next/link";
import { ArrowRight, BedDouble, ClipboardCheck, HardHat, Truck, WalletCards } from "lucide-react";
import { Panel } from "@/components/ui/page";
import { executiveOverview } from "@/modules/executive-dashboard/application/overview";

export const dynamic = "force-dynamic";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const pct = (value: number) => `${Math.round(value * 100)}%`;

function Block({ icon: Icon, title, href, children }: { icon: typeof BedDouble; title: string; href?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[#ebf1f7] text-[#083f7d]">
          <Icon size={18} />
        </span>
        <h2 className="flex-1 text-base font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-xs font-semibold text-[var(--oasis-primary)]">
            Ver <ArrowRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-[#d9dfe6] bg-[#f7f9fb] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-[#63778e]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "warn" ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

const Unavailable = () => <p className="text-sm text-[#63778e]">No se pudo cargar esta sección. Vuelve a abrir la página para reintentar.</p>;

export default async function Inicio() {
  const { ctx, today, approvals, hostels, modulares, distribution, finance, canOpenApprovals } = await executiveOverview();
  const dayLabel = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" }).format(new Date(`${today}T12:00:00Z`));
  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "America/Santiago" }).format(new Date(`${today}T12:00:00Z`));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--oasis-accent)]">Resumen ejecutivo</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Hola, {ctx.profile.first_name}</h1>
        <p className="mt-1 text-sm text-[#5c6f85] first-letter:uppercase">{dayLabel}</p>
      </header>

      {approvals && approvals.rows.length > 0 && (
        <Block icon={ClipboardCheck} title="Por aprobar" href={canOpenApprovals ? "/admin/approvals" : undefined}>
          <p className="mb-3 text-sm text-[#5c6f85]">
            {approvals.total === 0 ? "No tienes nada pendiente." : `${approvals.total} ${approvals.total === 1 ? "pendiente" : "pendientes"} en total.`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {approvals.rows.map((row) => (
              <Stat key={row.label} label={row.label} value={row.n} tone={row.n > 0 ? "warn" : undefined} />
            ))}
          </div>
        </Block>
      )}

      {hostels && (
        <Block icon={BedDouble} title="Hostales" href="/hostales">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={`Ingresos de ${monthLabel}`} value={clp.format(hostels.month.revenue)} />
            <Stat label="Ocupación del mes" value={pct(hostels.month.occupancy)} />
            <Stat label="Tarifa promedio" value={clp.format(hostels.month.adr)} />
            <Stat label="RevPAR" value={clp.format(hostels.month.revpar)} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#d9dfe6]">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Hoy</th>
                  <th className="px-2 py-2 text-right">Ocupación</th>
                  <th className="px-2 py-2 text-right">Ingresado</th>
                  <th className="px-2 py-2 text-right">Pendiente</th>
                  <th className="px-2 py-2 text-right">Cierres</th>
                </tr>
              </thead>
              <tbody>
                {hostels.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-2 font-semibold">{row.name}</td>
                    <td className="px-2 py-2 text-right">
                      {row.capacity ? pct(row.occupied / row.capacity) : "—"}
                      <span className="block text-[11px] text-slate-400">
                        {row.occupied} de {row.capacity}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">{clp.format(row.received)}</td>
                    <td className="px-2 py-2 text-right">{clp.format(row.pending)}</td>
                    <td className={`px-2 py-2 text-right ${row.pendingClosings > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>
                      {row.pendingClosings > 0 ? `${row.pendingClosings} sin emitir` : "al día"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {modulares && (
        <Block icon={HardHat} title="Oasis Modulares" href="/sales/projects">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {modulares.projects !== null && <Stat label="Proyectos en curso" value={modulares.projects} />}
            {modulares.requests !== null && <Stat label="Pedidos de materiales por revisar" value={modulares.requests} tone={modulares.requests > 0 ? "warn" : undefined} />}
            {modulares.lists !== null && <Stat label="Listas de compras abiertas" value={modulares.lists} />}
          </div>
        </Block>
      )}

      {distribution && (
        <Block icon={Truck} title={distribution.unitName} href="/finance/distribution">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Pedidos de hoy" value={distribution.orders} />
            <Stat label="Entregados" value={distribution.delivered} />
            <Stat label="Pendientes" value={distribution.pending} tone={distribution.pending > 0 ? "warn" : undefined} />
            <Stat label="Venta del día" value={clp.format(distribution.sales)} />
          </div>
        </Block>
      )}

      {finance && (
        <Block icon={WalletCards} title={`Pagos de ${monthLabel}`} href="/dashboard">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Solicitado" value={clp.format(finance.requested)} />
            <Stat label="Aprobado" value={clp.format(finance.approved)} />
            <Stat label="Pagado" value={clp.format(finance.paid)} />
            <Stat label="Pendiente de pago" value={clp.format(finance.pending)} tone={finance.overdue > 0 ? "warn" : undefined} />
          </div>
          {finance.overdue > 0 && <p className="mt-2 text-xs font-semibold text-red-700">{finance.overdue} pagos vencidos.</p>}
        </Block>
      )}

      {!approvals && !hostels && !modulares && !distribution && !finance && <Unavailable />}
    </div>
  );
}
