import Link from "next/link";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { recordEntryAction, voidEntryAction } from "./application/actions";
import type { CashFlowCategory, CashFlowEntryDetail } from "./application/queries";
import { clp, paymentMethods, type CashFlowKind } from "./domain/cash-flow";

export const inputClass =
  "mt-1 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--oasis-primary)]";

export function Notice({ success, error }: { success?: string; error?: string }) {
  const message = success || error;
  if (!message) return null;
  return (
    <p
      className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
    >
      {message}
    </p>
  );
}

export function CashFlowTabs({
  active,
  canManage,
}: {
  active: "daily" | "monthly" | "categories";
  canManage: boolean;
}) {
  const tabs = [
    ["daily", "/finance/cash-flow", "Cierre diario"],
    ["monthly", "/finance/cash-flow/monthly", "Caja mensual"],
    ...(canManage ? [["categories", "/finance/cash-flow/categories", "Categorías"]] : []),
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          className={`rounded-full border px-3 py-1.5 font-medium ${
            key === active
              ? "border-[var(--oasis-primary)] bg-[var(--oasis-primary)] text-white"
              : "bg-white hover:border-[var(--oasis-primary)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const tones = {
  income: "text-emerald-700",
  expense: "text-red-700",
  neutral: "text-slate-900",
} as const;

export function Kpi({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: keyof typeof tones;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#d9dfe6] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function signedTone(value: number): keyof typeof tones {
  return value > 0 ? "income" : value < 0 ? "expense" : "neutral";
}

export function EntryForm({
  kind,
  day,
  categories,
}: {
  kind: CashFlowKind;
  day: string;
  categories: CashFlowCategory[];
}) {
  const options = categories.filter((c) => c.kind === kind && c.active);
  const isIncome = kind === "income";
  return (
    <form action={recordEntryAction} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
      <input type="hidden" name="entry_date" value={day} />
      <input type="hidden" name="kind" value={kind} />
      <label className="block text-sm sm:col-span-2">
        Descripción
        <input
          name="description"
          required
          minLength={2}
          maxLength={300}
          placeholder={isIncome ? "Ej.: Ventas del turno mañana" : "Ej.: Compra de insumos de aseo"}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Categoría
        <select name="category_id" required className={inputClass}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Monto (CLP)
        <input
          name="amount"
          required
          inputMode="numeric"
          pattern="[0-9.]+"
          placeholder="0"
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Medio de pago
        <select name="payment_method" defaultValue="cash" className={inputClass}>
          {Object.entries(paymentMethods).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        N.º documento (opcional)
        <input name="reference" maxLength={120} placeholder="Boleta, factura…" className={inputClass} />
      </label>
      <button
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2 ${
          isIncome ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
        }`}
      >
        {isIncome ? "Agregar ingreso" : "Agregar gasto"}
      </button>
    </form>
  );
}

export function EntryList({
  entries,
  day,
  canVoid,
}: {
  entries: CashFlowEntryDetail[];
  day: string;
  canVoid: boolean;
}) {
  if (!entries.length)
    return <p className="py-6 text-center text-sm text-slate-500">Sin movimientos registrados.</p>;
  return (
    <ul className="divide-y">
      {entries.map((entry) => {
        const voided = Boolean(entry.voided_at);
        return (
          <li key={entry.id} className={`py-3 text-sm ${voided ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`font-medium ${voided ? "line-through" : ""}`}>{entry.description}</p>
                <p className="text-xs text-slate-500">
                  {entry.category_name} · {paymentMethods[entry.payment_method]}
                  {entry.reference ? ` · Doc. ${entry.reference}` : ""}
                  {entry.created_by_name ? ` · ${entry.created_by_name}` : ""}
                </p>
                {voided && (
                  <p className="text-xs text-red-700">Anulado: {entry.void_reason}</p>
                )}
              </div>
              <p className={`shrink-0 font-semibold tabular-nums ${voided ? "line-through" : ""}`}>
                {clp.format(entry.amount)}
              </p>
            </div>
            {canVoid && !voided && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-red-700">
                  Anular
                </summary>
                <form action={voidEntryAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="id" value={entry.id} />
                  <input type="hidden" name="date" value={day} />
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Motivo de la anulación"
                    className="flex-1 rounded-lg border px-2 py-1.5 text-xs"
                  />
                  <ConfirmButton
                    message="¿Anular este movimiento? Quedará registrado en la auditoría."
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Anular
                  </ConfirmButton>
                </form>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
