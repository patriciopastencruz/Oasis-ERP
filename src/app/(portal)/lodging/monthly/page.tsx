import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { ClpInput } from "@/components/lodging/clp-input";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadMonthly } from "@/modules/lodging/application/monthly-queries";
import {
  closeMonthAction,
  deleteLineAction,
  reopenMonthAction,
  saveLineAction,
  startMonthAction,
  toggleLineStatusAction,
} from "@/modules/lodging/application/monthly-actions";
import { clp, pct, santiagoToday } from "@/modules/lodging/domain/daily-closing";
import {
  breakEven,
  buildStatement,
  monthLabel,
  monthlyConclusions,
  nextMonth,
  percentChange,
  previousMonth,
  sectionLabels,
  sectionOrder,
} from "@/modules/lodging/domain/monthly-closing";

const sourceBadge = {
  reservas: "bg-[#e8f1fc] text-[#1c5cab]",
  diario: "bg-[#e3f6ef] text-[#137a55]",
  manual: "bg-slate-100 text-slate-600",
} as const;
const sourceLabel = { reservas: "Reservas", diario: "Cierres diarios", manual: "Manual" } as const;

function Kpi({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: number | null }) {
  return (
    <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className="mt-0.5 text-xs font-semibold text-slate-600">
          <span className={delta >= 0 ? "text-emerald-700" : "text-red-700"}>{delta >= 0 ? "▲" : "▼"}</span>{" "}
          {delta >= 0 ? "+" : ""}
          {pct(delta)} vs mes anterior
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function MonthlyClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; edit?: string; success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.monthly_closing.view");
  const canManage = ctx.permissions.has("lodging.monthly_closing.manage");
  const currentMonth = santiagoToday().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") && q.month! <= currentMonth ? q.month! : currentMonth;
  const { closing, summary, previous, ops } = await loadMonthly(supabase, unit.id, month);
  const statement = buildStatement(summary);
  const t = summary.totals;
  const income = Number(t.income);
  const editable = canManage && closing?.status === "draft";
  const editing = summary.lines.find((l) => l.id === q.edit);
  const be = breakEven(summary, ops);
  const conclusions = monthlyConclusions(summary, ops, previous, statement);
  const prevTotals = previous.summary?.totals;
  const field = "mt-1 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2 text-sm";
  const activeCategories = summary.categories.filter((c) => c.active);

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Cierre mensual"
        description="Estado de resultados del mes: ingresos, costos, inversión y utilidad, junto con la ocupación. Se completa solo con reservas y cierres diarios; administración agrega los gastos manuales."
      />
      {(q.error || q.success) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/lodging/monthly?month=${previousMonth(month)}`} aria-label="Mes anterior" className="grid size-10 place-items-center rounded-xl border bg-white">
          <ChevronLeft size={18} />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
        {month < currentMonth && (
          <Link href={`/lodging/monthly?month=${nextMonth(month)}`} aria-label="Mes siguiente" className="grid size-10 place-items-center rounded-xl border bg-white">
            <ChevronRight size={18} />
          </Link>
        )}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !closing ? "bg-slate-100 text-slate-600" : closing.status === "closed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {!closing ? "Sin iniciar" : closing.status === "closed" ? "Cerrado" : "En preparación"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {canManage && (
            <Link href="/lodging/monthly/categories" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
              Categorías
            </Link>
          )}
          <a
            href={`/api/lodging/monthly/report.pdf?month=${month}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white"
          >
            <FileText size={16} /> Ver informe PDF
          </a>
        </div>
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Finanzas</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Ingresos" value={clp(income)} delta={percentChange(income, prevTotals ? Number(prevTotals.income) : null)} />
        <Kpi label="Costos fijos" value={clp(t.fixed)} hint={income ? `${pct((Number(t.fixed) / income) * 100)} del ingreso` : undefined} />
        <Kpi label="Costos variables" value={clp(t.variable)} hint={income ? `${pct((Number(t.variable) / income) * 100)} del ingreso` : undefined} />
        <Kpi label="Inversión, retiros y otros" value={clp(Number(t.investment) + Number(t.withdrawal) + Number(t.other))} />
        <Kpi
          label="Utilidad"
          value={clp(t.profit)}
          hint={income ? `Margen ${pct((Number(t.profit) / income) * 100)}` : undefined}
          delta={percentChange(Number(t.profit), prevTotals ? Number(prevTotals.profit) : null)}
        />
      </div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Operación</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Ocupación" value={pct(ops.occupancy * 100)} hint={`${ops.nightsSold} noches vendidas · ${ops.totalRooms} hab.`} />
        <Kpi label="Venta promedio (ADR)" value={clp(ops.adr)} delta={percentChange(ops.adr, previous.ops?.adr)} />
        <Kpi label="RevPAR" value={clp(ops.revpar)} delta={percentChange(ops.revpar, previous.ops?.revpar)} />
        <Kpi label="Costo por noche" value={ops.nightsSold ? clp(Number(t.costs) / ops.nightsSold) : "—"} hint="Fijos + variables / noches" />
        <Kpi
          label="Punto de equilibrio"
          value={be.occupancy === null ? "—" : pct(be.occupancy * 100)}
          hint={be.nights === null ? "Sin ventas para calcular" : `${Math.ceil(be.nights)} noches mínimas`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Estado de resultados</h2>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(Object.keys(sourceLabel) as (keyof typeof sourceLabel)[]).map((k) => (
                <span key={k} className={`rounded-full px-2 py-0.5 font-semibold ${sourceBadge[k]}`}>
                  {sourceLabel[k]}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody>
                {statement.map((section) => (
                  <SectionRows key={section.key} section={section} income={income} month={month} editable={editable} />
                ))}
                <tr className="border-t-2 border-slate-800">
                  <td className="py-2.5 font-bold uppercase">Utilidad del mes</td>
                  <td className="text-right font-bold tabular-nums">{clp(t.profit)}</td>
                  <td className="pl-3 text-right text-xs font-semibold text-slate-500">{income ? pct((Number(t.profit) / income) * 100) : "—"}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Venta hospedaje = pagos recibidos en el mes. Los gastos de cierres diarios solo cuentan si el cierre del día fue emitido ({summary.daily_closings.issued}{" "}
            cierres emitidos este mes).
          </p>
        </Panel>

        <div className="space-y-4">
          {canManage && !closing && (
            <Panel>
              <h2 className="font-semibold">Iniciar cierre de {monthLabel(month)}</h2>
              <p className="mt-2 text-sm text-slate-500">Se crea el borrador y se copian los costos fijos del último mes como pendientes de pago.</p>
              <form action={startMonthAction} className="mt-3">
                <input type="hidden" name="month" value={month} />
                <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3 text-sm font-semibold text-white">Iniciar cierre</button>
              </form>
            </Panel>
          )}
          {editable && closing && (
            <Panel>
              <h2 className="mb-3 font-semibold">{editing ? "Editar línea" : "Agregar ingreso o gasto"}</h2>
              <form action={saveLineAction} key={editing?.id ?? "new"} className="space-y-3">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="closing_id" value={closing.id} />
                {editing && <input type="hidden" name="line_id" value={editing.id} />}
                <label className="block text-sm">
                  Categoría
                  <select name="category_id" required defaultValue={editing?.category_id ?? ""} className={field}>
                    <option value="" disabled>
                      Selecciona
                    </option>
                    {sectionOrder.map((s) => (
                      <optgroup key={s} label={sectionLabels[s]}>
                        {activeCategories
                          .filter((c) => c.section === s)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Descripción
                  <input name="description" required minLength={2} maxLength={160} defaultValue={editing?.description} placeholder="Ej.: Arriendo terreno" className={field} />
                </label>
                <label className="block text-sm">
                  Monto
                  <ClpInput name="amount" defaultValue={editing ? String(editing.amount) : ""} className={field} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    Pagado por
                    <input name="payer" maxLength={60} defaultValue={editing?.payer ?? ""} placeholder="oasis, Patricio…" className={field} />
                  </label>
                  <label className="block text-sm">
                    Estado
                    <select name="payment_status" defaultValue={editing?.payment_status ?? "pagado"} className={field}>
                      <option value="pagado">Pagado</option>
                      <option value="pendiente">Pendiente</option>
                    </select>
                  </label>
                </div>
                <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white">{editing ? "Guardar cambios" : "Agregar"}</button>
                {editing && (
                  <Link href={`/lodging/monthly?month=${month}`} className="block text-center text-sm text-slate-500">
                    Cancelar edición
                  </Link>
                )}
              </form>
            </Panel>
          )}
          <Panel>
            <h2 className="mb-2 font-semibold">Conclusiones del mes</h2>
            <ul className="space-y-2 text-sm">
              {conclusions.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#2a78d6]" />
                  {c}
                </li>
              ))}
            </ul>
          </Panel>
          {canManage && closing?.status === "draft" && (
            <Panel>
              <h2 className="font-semibold">Cerrar el mes</h2>
              <p className="mt-1 text-sm text-slate-500">
                {summary.pending.count ? `Hay ${summary.pending.count} pago(s) pendiente(s) por ${clp(summary.pending.amount)}. ` : ""}
                Al cerrar, los totales quedan fijos en el informe aunque después lleguen pagos o gastos.
              </p>
              <form action={closeMonthAction} className="mt-3 space-y-2">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="closing_id" value={closing.id} />
                <textarea name="notes" maxLength={2000} placeholder="Observaciones del cierre (opcional)" className={`${field} min-h-16`} />
                <ConfirmButton
                  message={`¿Cerrar ${monthLabel(month)}? Los totales quedarán fijos.`}
                  className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Cerrar mes
                </ConfirmButton>
              </form>
            </Panel>
          )}
          {closing?.status === "closed" && (
            <Panel>
              <h2 className="font-semibold">Mes cerrado</h2>
              <p className="mt-1 text-sm text-slate-500">
                {closing.closed_at && new Date(closing.closed_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}
                {closing.notes ? ` · ${closing.notes}` : ""}
              </p>
              {canManage && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[#0b4f9c]">Reabrir mes</summary>
                  <form action={reopenMonthAction} className="mt-2 space-y-2">
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="closing_id" value={closing.id} />
                    <input name="reason" required minLength={3} placeholder="Motivo de la reapertura" className={field} />
                    <ConfirmButton message="¿Reabrir el mes? Los totales se recalcularán en vivo." className="w-full rounded-xl border px-4 py-2 text-sm font-semibold">
                      Reabrir
                    </ConfirmButton>
                  </form>
                </details>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function SectionRows({
  section,
  income,
  month,
  editable,
}: {
  section: ReturnType<typeof buildStatement>[number];
  income: number;
  month: string;
  editable: boolean;
}) {
  return (
    <>
      <tr className="bg-[#eef3f9]">
        <td className="px-2 py-2 font-bold uppercase">{section.name}</td>
        <td className="text-right font-bold tabular-nums">{clp(section.total)}</td>
        <td className="pl-3 text-right text-xs font-semibold text-slate-500">
          {section.key === "income" ? "100%" : income ? pct((section.total / income) * 100) : "—"}
        </td>
        <td colSpan={2} />
      </tr>
      {!section.groups.length && (
        <tr>
          <td colSpan={5} className="px-4 py-2 text-xs text-slate-400">
            Sin movimientos.
          </td>
        </tr>
      )}
      {section.groups.map((g) => (
        <GroupRows key={g.id} group={g} income={income} month={month} editable={editable} />
      ))}
    </>
  );
}

function GroupRows({
  group,
  income,
  month,
  editable,
}: {
  group: ReturnType<typeof buildStatement>[number]["groups"][number];
  income: number;
  month: string;
  editable: boolean;
}) {
  return (
    <>
      <tr className="border-t">
        <td className="px-4 pt-2 text-xs font-bold text-slate-600">{group.name}</td>
        <td className="pt-2 text-right text-xs font-bold tabular-nums text-slate-600">{clp(group.total)}</td>
        <td colSpan={3} />
      </tr>
      {group.items.map((item, i) => (
        <tr key={item.lineId ?? `${group.id}-${i}`}>
          <td className="py-1 pl-7 pr-2">
            <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadge[item.source]}`}>{sourceLabel[item.source]}</span>
            {item.label}
            {item.payer ? <span className="text-xs text-slate-500"> · {item.payer}</span> : null}
          </td>
          <td className="text-right tabular-nums">{clp(item.amount)}</td>
          <td className="pl-3 text-right text-xs text-slate-400">{income ? pct((item.amount / income) * 100) : ""}</td>
          <td className="pl-3 text-right text-xs">
            {item.status &&
              (editable ? (
                <form action={toggleLineStatusAction} className="inline">
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="line_id" value={item.lineId} />
                  <button
                    title="Cambiar estado de pago"
                    className={`rounded-full px-2 py-0.5 font-semibold ${item.status === "pendiente" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
                  >
                    {item.status === "pendiente" ? "Pendiente" : "Pagado"}
                  </button>
                </form>
              ) : (
                <span className={item.status === "pendiente" ? "font-semibold text-amber-800" : "text-slate-500"}>
                  {item.status === "pendiente" ? "Pendiente" : "Pagado"}
                </span>
              ))}
          </td>
          <td className="w-28 pl-3 text-right text-xs">
            {editable && item.lineId && (
              <span className="inline-flex gap-2">
                <Link href={`/lodging/monthly?month=${month}&edit=${item.lineId}`} className="font-semibold text-[#0b4f9c]">
                  Editar
                </Link>
                <form action={deleteLineAction} className="inline">
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="line_id" value={item.lineId} />
                  <ConfirmButton message="¿Eliminar esta línea?" className="font-semibold text-red-700">
                    Quitar
                  </ConfirmButton>
                </form>
              </span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
