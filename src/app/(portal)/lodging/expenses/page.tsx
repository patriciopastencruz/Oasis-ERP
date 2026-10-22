import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { clp, formatDate, lodgingContext } from "@/modules/lodging/application/queries";
import { loadExpenseCategories, loadMonthExpenses } from "@/modules/lodging/application/expense-queries";
import {
  addExpenseCategoryAction,
  recordExpenseAction,
  removeExpenseCategoryAction,
  voidExpenseAction,
} from "@/modules/lodging/application/expense-actions";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import {
  EXPENSE_UNIT_CODES,
  currentMonth,
  expensePaymentLabels,
  expenseSectionLabels,
  shiftMonth,
  summarizeExpenses,
} from "@/modules/lodging/domain/expenses";

const monthLabel = (month: string) => {
  const label = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const field = "mt-1 block w-full rounded-lg border border-[#d9dfe6] bg-white px-3 py-2 text-sm";
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; success?: string; error?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext("lodging.expenses.view");
  if (!EXPENSE_UNIT_CODES.includes(unit.code)) redirect("/lodging");
  const today = santiagoToday();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? (q.month as string) : currentMonth(today);
  const canRecord = ctx.permissions.has("lodging.expenses.record");
  const canManage = ctx.permissions.has("lodging.expenses.manage");

  const [categories, rows] = await Promise.all([loadExpenseCategories(supabase, unit.id), loadMonthExpenses(supabase, unit.id, month)]);
  const summary = summarizeExpenses(rows);
  const sections = Object.keys(expenseSectionLabels)
    .map((key) => ({ key, items: categories.filter((c) => c.section === key) }))
    .filter((s) => s.items.length);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Gastos"
        description="Ingresa cada gasto del hostal con su tipo (aseo y limpieza, luz, agua, gas, insumos de cocina...). Después se usan para el estado de resultados."
      />
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}

      {canRecord && (
        <Panel className="mb-4">
          <h2 className="font-semibold">Ingresar un gasto</h2>
          <form action={recordExpenseAction} className="mt-3 grid gap-3 md:grid-cols-6">
            <input type="hidden" name="unit_id" value={unit.id} />
            <input type="hidden" name="month" value={month} />
            <label className="block text-sm md:col-span-1">
              Fecha
              <input type="date" name="expense_date" defaultValue={today} max={today} required className={field} />
            </label>
            <label className="block text-sm md:col-span-2">
              Tipo de gasto
              <select name="category_id" required defaultValue="" className={field}>
                <option value="" disabled>
                  Elige el tipo…
                </option>
                {sections.map((s) => (
                  <optgroup key={s.key} label={expenseSectionLabels[s.key]}>
                    {s.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-1">
              Monto (CLP)
              <input name="amount" inputMode="numeric" placeholder="45000" required className={field} />
            </label>
            <label className="block text-sm md:col-span-2">
              Forma de pago
              <select name="payment_method" defaultValue="cash" className={field}>
                {Object.entries(expensePaymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-3">
              Descripción
              <input name="description" maxLength={200} placeholder="Ej.: cuenta de luz de octubre" required className={field} />
            </label>
            <label className="block text-sm md:col-span-2">
              Proveedor (opcional)
              <input name="supplier" maxLength={120} placeholder="Ej.: Enel" className={field} />
            </label>
            <label className="block text-sm md:col-span-1">
              N.º de boleta (opcional)
              <input name="document_number" maxLength={60} className={field} />
            </label>
            <div className="md:col-span-6">
              <button className="rounded-xl bg-[#0b4f9c] px-5 py-2.5 text-sm font-semibold text-white">Guardar gasto</button>
              <span className="ml-3 text-xs text-slate-500">Los gastos no se borran: si te equivocas, anúlalo con un motivo.</span>
            </div>
          </form>
        </Panel>
      )}

      <div className="mb-3 flex items-center gap-2">
        <Link href={`/lodging/expenses?month=${prev}`} aria-label="Mes anterior" className="rounded-lg border border-[#d9dfe6] bg-white p-2 hover:bg-slate-50">
          <ChevronLeft size={16} />
        </Link>
        <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
        <Link href={`/lodging/expenses?month=${next}`} aria-label="Mes siguiente" className="rounded-lg border border-[#d9dfe6] bg-white p-2 hover:bg-slate-50">
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Total de gastos del mes</p>
          <p className="mt-1 text-3xl font-bold">{clp.format(summary.total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.count} {summary.count === 1 ? "gasto" : "gastos"}
            {summary.voided > 0 && ` · ${summary.voided} anulado${summary.voided === 1 ? "" : "s"}`}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tipo con más gasto</p>
          <p className="mt-1 text-xl font-bold">{summary.categories[0]?.category ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-500">{summary.categories[0] ? `${clp.format(summary.categories[0].total)} · ${pct(summary.categories[0].share)} del mes` : "Sin gastos este mes"}</p>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-wide text-slate-500">Por forma de pago</p>
          {summary.methods.length ? (
            <ul className="mt-1 space-y-0.5 text-sm">
              {summary.methods.map((m) => (
                <li key={m.method} className="flex justify-between gap-2">
                  <span>{expensePaymentLabels[m.method as keyof typeof expensePaymentLabels] ?? m.method}</span>
                  <b className="tabular-nums">{clp.format(m.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Sin gastos este mes</p>
          )}
        </Panel>
      </div>

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="font-semibold">Resumen por tipo de gasto</h2>
        {summary.categories.length ? (
          <table className="mt-3 w-full min-w-[480px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1.5">Tipo</th>
                <th>Sección</th>
                <th className="text-right">Gastos</th>
                <th className="text-right">Total</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.categories.map((c) => (
                <tr key={c.category}>
                  <td className="py-2 font-medium">{c.category}</td>
                  <td className="text-slate-500">{expenseSectionLabels[c.section] ?? c.section}</td>
                  <td className="text-right tabular-nums">{c.count}</td>
                  <td className="text-right font-semibold tabular-nums">{clp.format(c.total)}</td>
                  <td className="text-right tabular-nums text-slate-500">{pct(c.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Aún no hay gastos en {monthLabel(month)}.</p>
        )}
      </Panel>

      <Panel className="mb-4 overflow-x-auto">
        <h2 className="font-semibold">Gastos de {monthLabel(month)}</h2>
        {rows.length ? (
          <table className="mt-3 w-full min-w-[760px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1.5">Fecha</th>
                <th>Tipo</th>
                <th>Detalle</th>
                <th>Pago</th>
                <th className="text-right">Monto</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.id} className={`align-top ${e.voided_at ? "text-slate-400" : ""}`}>
                  <td className="py-2 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                  <td className="font-medium">{e.category}</td>
                  <td>
                    <span className={e.voided_at ? "line-through" : ""}>{e.description}</span>
                    {(e.supplier || e.document_number) && (
                      <span className="block text-[11px] text-slate-500">
                        {[e.supplier, e.document_number ? `N.º ${e.document_number}` : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {e.voided_at && <span className="block text-[11px] text-red-600">Anulado: {e.void_reason}</span>}
                  </td>
                  <td>{expensePaymentLabels[e.payment_method as keyof typeof expensePaymentLabels] ?? e.payment_method}</td>
                  <td className={`text-right font-semibold tabular-nums ${e.voided_at ? "line-through" : ""}`}>{clp.format(e.amount)}</td>
                  <td className="pl-3 text-right">
                    {canRecord && !e.voided_at && (
                      <details className="inline-block text-left">
                        <summary className="cursor-pointer text-xs font-semibold text-red-700">Anular</summary>
                        <form action={voidExpenseAction} className="mt-2 flex w-56 flex-col gap-2 rounded-lg border border-[#d9dfe6] bg-white p-2 shadow-sm">
                          <input type="hidden" name="expense_id" value={e.id} />
                          <input type="hidden" name="month" value={month} />
                          <input name="reason" required minLength={3} maxLength={300} placeholder="Motivo de la anulación" className="rounded-md border border-[#d9dfe6] px-2 py-1 text-xs" />
                          <ConfirmButton message="¿Anular este gasto? Quedará registrado con su motivo." className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                            Anular gasto
                          </ConfirmButton>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Aún no hay gastos en {monthLabel(month)}.</p>
        )}
        {!canManage && canRecord && <p className="mt-3 text-xs text-slate-500">Puedes anular los gastos que ingresaste hoy. Los demás los anula administración.</p>}
      </Panel>

      {canManage && (
        <Panel>
          <h2 className="font-semibold">Tipos de gasto</h2>
          <p className="mt-1 text-sm text-slate-600">Estos son los tipos que aparecen al ingresar un gasto. Quitar un tipo no borra los gastos ya ingresados.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-full border border-[#d9dfe6] bg-slate-50 py-1 pl-3 pr-1 text-xs">
                <span>
                  {c.name} <span className="text-slate-400">· {expenseSectionLabels[c.section] ?? c.section}</span>
                </span>
                <form action={removeExpenseCategoryAction}>
                  <input type="hidden" name="category_id" value={c.id} />
                  <input type="hidden" name="month" value={month} />
                  <ConfirmButton message={`¿Quitar «${c.name}» de la lista de tipos de gasto?`} className="rounded-full px-2 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700">
                    ✕
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={addExpenseCategoryAction} className="mt-4 grid gap-3 md:grid-cols-4">
            <input type="hidden" name="unit_id" value={unit.id} />
            <input type="hidden" name="month" value={month} />
            <label className="block text-sm md:col-span-2">
              Nuevo tipo de gasto
              <input name="name" required minLength={2} maxLength={80} placeholder="Ej.: Seguridad y alarmas" className={field} />
            </label>
            <label className="block text-sm">
              Sección del estado de resultados
              <select name="section" defaultValue="variable" className={field}>
                {Object.entries(expenseSectionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Agregar tipo</button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
