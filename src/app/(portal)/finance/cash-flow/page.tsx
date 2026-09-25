import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import {
  closeDayAction,
  reopenDayAction,
} from "@/modules/finance/cash-flow/application/actions";
import {
  cashFlowContext,
  listCategories,
  loadDay,
} from "@/modules/finance/cash-flow/application/queries";
import {
  chileToday,
  clp,
  formatDay,
  paymentMethods,
  resolveDay,
  shiftDay,
  totalsOf,
  type PaymentMethod,
} from "@/modules/finance/cash-flow/domain/cash-flow";
import {
  CashFlowTabs,
  EntryForm,
  EntryList,
  inputClass,
  Kpi,
  Notice,
  signedTone,
} from "@/modules/finance/cash-flow/ui";

export default async function CashFlowDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase, canRecord, canManage } = await cashFlowContext();
  const today = chileToday();
  const day = resolveDay(q.date, today);
  const [categories, { entries, closing, suggestedOpeningCash }] = await Promise.all([
    listCategories(supabase, unit.id),
    loadDay(supabase, unit.id, day),
  ]);
  const active = entries.filter((e) => !e.voided_at);
  const totals = totalsOf(active);
  const isClosed = closing?.status === "closed";
  const editable = canRecord && !isClosed;
  const cashIn = active
    .filter((e) => e.kind === "income" && e.payment_method === "cash")
    .reduce((s, e) => s + e.amount, 0);
  const cashOut = active
    .filter((e) => e.kind === "expense" && e.payment_method === "cash")
    .reduce((s, e) => s + e.amount, 0);
  const methods = (Object.keys(paymentMethods) as PaymentMethod[])
    .map((method) => ({
      method,
      ...totalsOf(active.filter((e) => e.payment_method === method)),
    }))
    .filter((m) => m.income || m.expense);

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Flujo de caja"
        description="Registra todos los ingresos y gastos del día y realiza el cierre diario. Los cierres alimentan la caja mensual con ingresos, gastos y utilidad."
      />
      <CashFlowTabs active="daily" canManage={canManage} />
      <Notice success={q.success} error={q.error} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/finance/cash-flow?date=${shiftDay(day, -1)}`}
          aria-label="Día anterior"
          className="grid size-10 place-items-center rounded-xl border bg-white"
        >
          <ChevronLeft size={18} />
        </Link>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={day}
            max={today}
            className="rounded-xl border bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Ir</button>
        </form>
        {day < today ? (
          <Link
            href={`/finance/cash-flow?date=${shiftDay(day, 1)}`}
            aria-label="Día siguiente"
            className="grid size-10 place-items-center rounded-xl border bg-white"
          >
            <ChevronRight size={18} />
          </Link>
        ) : null}
        {day !== today && (
          <Link href="/finance/cash-flow" className="text-sm font-semibold text-[var(--oasis-primary)]">
            Hoy
          </Link>
        )}
        <p className="ml-auto text-sm font-semibold first-letter:uppercase">{formatDay(day)}</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ingresos del día" value={clp.format(totals.income)} tone="income" />
        <Kpi label="Gastos del día" value={clp.format(totals.expense)} tone="expense" />
        <Kpi label="Resultado del día" value={clp.format(totals.net)} tone={signedTone(totals.net)} />
        <Kpi
          label="Estado"
          value={isClosed ? "Cerrado" : "Abierto"}
          hint={
            isClosed
              ? `Cerrado el ${new Date(closing.closed_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}`
              : closing?.status === "reopened"
                ? `Reabierto: ${closing.reopen_reason ?? ""}`
                : `${active.length} movimiento(s) registrados`
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {(["income", "expense"] as const).map((kind) => (
          <Panel key={kind}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{kind === "income" ? "Ingresos" : "Gastos"}</h2>
              <span
                className={`text-sm font-semibold tabular-nums ${kind === "income" ? "text-emerald-700" : "text-red-700"}`}
              >
                {clp.format(kind === "income" ? totals.income : totals.expense)}
              </span>
            </div>
            {editable && <EntryForm kind={kind} day={day} categories={categories} />}
            <EntryList
              entries={entries.filter((e) => e.kind === kind)}
              day={day}
              canVoid={editable}
            />
          </Panel>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="mb-3 font-semibold">Resumen por medio de pago</h2>
          {methods.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2">Medio</th>
                  <th className="pb-2 text-right">Ingresos</th>
                  <th className="pb-2 text-right">Gastos</th>
                  <th className="pb-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {methods.map((m) => (
                  <tr key={m.method} className="border-t">
                    <td className="py-2">{paymentMethods[m.method]}</td>
                    <td className="text-right">{clp.format(m.income)}</td>
                    <td className="text-right">{clp.format(m.expense)}</td>
                    <td className="text-right font-semibold">{clp.format(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">Aún no hay movimientos en el día.</p>
          )}
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold">Cierre del día</h2>
          {isClosed && closing ? (
            <>
              <dl className="grid grid-cols-2 gap-y-2 text-sm tabular-nums">
                <dt>Ingresos</dt>
                <dd className="text-right">{clp.format(Number(closing.total_income))}</dd>
                <dt>Gastos</dt>
                <dd className="text-right">{clp.format(Number(closing.total_expense))}</dd>
                <dt className="font-semibold">Resultado</dt>
                <dd className="text-right font-semibold">{clp.format(Number(closing.net_result))}</dd>
                <dt className="border-t pt-2">Fondo inicial de caja</dt>
                <dd className="border-t pt-2 text-right">{clp.format(Number(closing.opening_cash))}</dd>
                <dt>Efectivo esperado</dt>
                <dd className="text-right">{clp.format(Number(closing.expected_cash))}</dd>
                <dt>Efectivo contado</dt>
                <dd className="text-right">
                  {closing.counted_cash === null ? "—" : clp.format(Number(closing.counted_cash))}
                </dd>
                {closing.cash_difference !== null && (
                  <>
                    <dt>Diferencia</dt>
                    <dd
                      className={`text-right font-semibold ${Number(closing.cash_difference) === 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {clp.format(Number(closing.cash_difference))}
                    </dd>
                  </>
                )}
              </dl>
              {closing.notes && <p className="mt-3 text-sm text-slate-600">Observaciones: {closing.notes}</p>}
              {canManage && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--oasis-primary)]">
                    Reabrir día
                  </summary>
                  <form action={reopenDayAction} className="mt-2 space-y-2">
                    <input type="hidden" name="date" value={day} />
                    <input name="reason" required minLength={3} placeholder="Motivo de la reapertura" className={inputClass} />
                    <ConfirmButton
                      message="¿Reabrir este día? Podrán registrarse y anularse movimientos hasta volver a cerrarlo."
                      className="rounded-xl border px-4 py-2 text-sm font-semibold"
                    >
                      Reabrir
                    </ConfirmButton>
                  </form>
                </details>
              )}
            </>
          ) : canRecord ? (
            <form action={closeDayAction} className="space-y-3">
              <input type="hidden" name="date" value={day} />
              <dl className="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
                <dt>Ingresos en efectivo</dt>
                <dd className="text-right text-emerald-700">{clp.format(cashIn)}</dd>
                <dt>Gastos en efectivo</dt>
                <dd className="text-right text-red-700">{clp.format(cashOut)}</dd>
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Fondo inicial de caja
                  <input
                    name="opening_cash"
                    inputMode="numeric"
                    pattern="[0-9.]*"
                    defaultValue={suggestedOpeningCash || ""}
                    placeholder="0"
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  Efectivo contado (opcional)
                  <input name="counted_cash" inputMode="numeric" pattern="[0-9.]*" placeholder="Arqueo" className={inputClass} />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Efectivo esperado = fondo inicial + ingresos en efectivo − gastos en efectivo. Si ingresas el efectivo
                contado, el cierre registra la diferencia. Los totales los calcula el sistema.
              </p>
              <label className="block text-sm">
                Observaciones
                <textarea name="notes" maxLength={1000} className={`${inputClass} min-h-16`} />
              </label>
              <ConfirmButton
                message="¿Cerrar el día? Luego no se podrán agregar ni anular movimientos sin reabrirlo."
                className="w-full rounded-xl bg-[var(--oasis-primary)] px-4 py-3 text-sm font-semibold text-white"
              >
                Cerrar día
              </ConfirmButton>
            </form>
          ) : (
            <p className="text-sm text-slate-500">El día aún no ha sido cerrado.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
