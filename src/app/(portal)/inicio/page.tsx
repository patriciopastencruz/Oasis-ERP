import Link from "next/link";
import { ArrowRight, BedDouble, ClipboardCheck, HardHat, Truck, WalletCards } from "lucide-react";
import { Panel } from "@/components/ui/page";
import { executiveOverview } from "@/modules/executive-dashboard/application/overview";

export const dynamic = "force-dynamic";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
/** Desde 10 millones se escribe «$48,3 mill.» para que el monto quepa en el recuadro del celular. */
const money = (value: number) => (Math.abs(value) >= 10_000_000 ? `$${millions.format(value / 1_000_000)} mill.` : clp.format(value));
const pct = (value: number) => `${Math.round(value * 100)}%`;

function Block({ icon: Icon, title, href, children }: { icon: typeof BedDouble; title: string; href?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-3 sm:p-5">
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

function Stat({ label, value, tone, note }: { label: string; value: React.ReactNode; tone?: "warn"; note?: string }) {
  return (
    <div className="rounded-xl border border-[#d9dfe6] bg-[#f7f9fb] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-[#63778e]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "warn" ? "text-red-700" : ""}`}>{value}</p>
      {note && <p className="text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

const shortMonth = (key: string) => new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`)).replace(".", "");

/** Barras por mes (los últimos seis); el mes en curso va destacado. */
function MonthlyBars({ title, months, currentKey, show }: { title: string; months: { key: string; value: number }[]; currentKey: string; show: (value: number) => string }) {
  const max = Math.max(1, ...months.map((m) => m.value));
  return (
    <figure className="rounded-xl border border-[#d9dfe6] bg-white p-3">
      <figcaption className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#63778e]">{title}</figcaption>
      <div className="flex h-36 items-end gap-2 border-b border-[#d9dfe6]" role="img" aria-label={`${title}: ${months.map((m) => `${shortMonth(m.key)} ${show(m.value)}`).join(", ")}`}>
        {months.map((m) => (
          <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <span className="truncate text-center text-[11px] font-bold tabular-nums sm:text-xs">{show(m.value)}</span>
            <div
              className={`w-full rounded-t-md ${m.key === currentKey ? "bg-[var(--oasis-primary)]" : "bg-[#9db9dc]"}`}
              style={{ height: `${Math.max(2, Math.round((m.value / max) * 100))}%`, maxHeight: "calc(100% - 1.25rem)" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {months.map((m) => (
          <span key={m.key} className={`min-w-0 flex-1 text-center text-[11px] capitalize ${m.key === currentKey ? "font-bold text-[var(--oasis-primary)]" : "text-slate-500"}`}>
            {shortMonth(m.key)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Goal({ value, goal, ok }: { value: string; goal: string | null; ok: boolean }) {
  return (
    <td className="px-1 py-2 sm:px-1.5 text-right">
      <span className={ok ? "" : "text-red-700"}>{value}</span>
      {goal && <span className="block text-[11px] text-slate-400">meta {goal}</span>}
    </td>
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
            <Stat label={`Ingresos de ${monthLabel}`} value={money(hostels.month.revenue)} />
            <Stat label="Ocupación del mes" value={pct(hostels.month.occupancy)} />
            <Stat label="Tarifa promedio" value={clp.format(hostels.month.adr)} />
            <Stat label="RevPAR" value={clp.format(hostels.month.revpar)} />
          </div>
          <div className="mb-3 overflow-x-auto rounded-xl border border-[#d9dfe6]">
            <p className="bg-slate-50 px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cómo vamos en {monthLabel}, del 1 al {Number(today.slice(8))}
            </p>
            <table className="w-full text-[12px] tabular-nums sm:text-[13px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-1 py-2 sm:px-1.5">Hostal</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Ingresos</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Ocup.</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Tarifa</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">RevPAR</th>
                </tr>
              </thead>
              <tbody>
                {hostels.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-1 py-2 sm:px-1.5 font-semibold">{row.name}</td>
                    <td className="px-1 py-2 sm:px-1.5 text-right">{money(row.month.revenue)}</td>
                    <Goal value={pct(row.month.occupancy)} goal={row.goals.occupancy !== null ? `${Math.round(row.goals.occupancy)}%` : null} ok={row.goals.occupancy === null || row.month.occupancy * 100 >= row.goals.occupancy} />
                    <Goal value={clp.format(row.month.adr)} goal={row.goals.adr !== null ? clp.format(row.goals.adr) : null} ok={row.goals.adr === null || row.month.adr >= row.goals.adr} />
                    <Goal value={clp.format(row.month.revpar)} goal={row.goals.revpar !== null ? clp.format(row.goals.revpar) : null} ok={row.goals.revpar === null || row.month.revpar >= row.goals.revpar} />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t px-2 py-1.5 text-[11px] text-slate-500">Bajo cada valor, la meta del hostal (en rojo si va por debajo).</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#d9dfe6]">
            <table className="w-full text-[12px] tabular-nums sm:text-[13px]">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-1 py-2 sm:px-1.5">Hoy</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Ocup.</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Ingresado</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Pendiente</th>
                  <th className="px-1 py-2 sm:px-1.5 text-right">Cierres</th>
                </tr>
              </thead>
              <tbody>
                {hostels.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-1 py-2 sm:px-1.5 font-semibold">{row.name}</td>
                    <td className="px-1 py-2 sm:px-1.5 text-right">
                      {row.capacity ? pct(row.occupied / row.capacity) : "—"}
                      <span className="block text-[11px] text-slate-400">
                        {row.occupied} de {row.capacity}
                      </span>
                    </td>
                    <td className="px-1 py-2 sm:px-1.5 text-right">{money(row.received)}</td>
                    <td className="px-1 py-2 sm:px-1.5 text-right">{money(row.pending)}</td>
                    <td className={`px-1 py-2 sm:px-1.5 text-right ${row.pendingClosings > 0 ? "font-semibold text-red-700" : "text-slate-400"}`}>
                      {row.pendingClosings > 0 ? `${row.pendingClosings} pend.` : "al día"}
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
          {modulares.quotations && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Cotizaciones</h3>
                <Link href="/sales/quotations" className="flex items-center gap-1 text-xs font-semibold text-[var(--oasis-primary)]">
                  Ver <ArrowRight size={13} />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat
                  label={`Realizadas en ${monthLabel}`}
                  value={modulares.quotations.current.count}
                  note={`${modulares.quotations.previous.count} el mes anterior`}
                />
                <Stat label={`Monto cotizado en ${monthLabel}`} value={money(modulares.quotations.current.amount)} />
                <Stat label="Aprobadas del mes" value={modulares.quotations.current.approved} />
                <Stat label="Por aprobar" value={modulares.quotations.pending} tone={modulares.quotations.pending > 0 ? "warn" : undefined} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MonthlyBars
                  title="Cotizaciones realizadas por mes"
                  months={modulares.quotations.months.map((m) => ({ key: m.key, value: m.count }))}
                  currentKey={today.slice(0, 7)}
                  show={(value) => String(value)}
                />
                <MonthlyBars
                  title="Monto cotizado por mes (millones de pesos)"
                  months={modulares.quotations.months.map((m) => ({ key: m.key, value: m.amount }))}
                  currentKey={today.slice(0, 7)}
                  show={(value) => millions.format(value / 1_000_000)}
                />
              </div>
            </div>
          )}
        </Block>
      )}

      {distribution && (
        <Block icon={Truck} title={distribution.unitName} href="/finance/distribution">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Pedidos de hoy" value={distribution.orders} />
            <Stat label="Entregados" value={distribution.delivered} />
            <Stat label="Pendientes" value={distribution.pending} tone={distribution.pending > 0 ? "warn" : undefined} />
            <Stat label="Venta del día" value={money(distribution.sales)} />
          </div>
        </Block>
      )}

      {finance && (
        <Block icon={WalletCards} title={`Pagos de ${monthLabel}`} href="/dashboard">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Solicitado" value={money(finance.requested)} />
            <Stat label="Aprobado" value={money(finance.approved)} />
            <Stat label="Pagado" value={money(finance.paid)} />
            <Stat label="Pendiente de pago" value={money(finance.pending)} tone={finance.overdue > 0 ? "warn" : undefined} />
          </div>
          {finance.overdue > 0 && <p className="mt-2 text-xs font-semibold text-red-700">{finance.overdue} pagos vencidos.</p>}
        </Block>
      )}

      {!approvals && !hostels && !modulares && !distribution && !finance && <Unavailable />}
    </div>
  );
}
