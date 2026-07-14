"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  executePaymentAction,
  type PaymentResult,
} from "@/modules/finance/payment-control/application/payment-actions";
const options = (
  <>
    <option value="bank_transfer">Transferencia bancaria</option>
    <option value="card">Tarjeta</option>
    <option value="check">Cheque</option>
    <option value="cash">Efectivo</option>
    <option value="petty_cash">Caja chica</option>
    <option value="other">Otro</option>
  </>
);
export function ExecuteForm({
  requestId,
  companyId,
  amount,
  useSupplierBankAccount,
}: {
  requestId: string;
  companyId: string;
  amount: number;
  useSupplierBankAccount: boolean;
}) {
  const router = useRouter(),
    [state, action, pending] = useActionState(executePaymentAction, {
      success: false,
    } as PaymentResult),
    [method, setMethod] = useState(
      useSupplierBankAccount ? "bank_transfer" : "cash",
    );
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="company_id" value={companyId} />
      <h2 className="font-semibold">Registrar pago</h2>
      <p className="text-sm text-slate-600">
        {useSupplierBankAccount
          ? "La solicitud considera la cuenta bancaria congelada del proveedor."
          : "La solicitud no considera la cuenta bancaria del proveedor. Registra el medio realmente utilizado."}
      </p>
      {state.message && <Message state={state} />}
      <label className="block text-sm">
        Fecha y hora real
        <input
          type="datetime-local"
          name="paid_at"
          required
          className="mt-1 w-full rounded-xl border p-3"
        />
      </label>
      <label className="block text-sm">
        Medio real
        <select
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="mt-1 w-full rounded-xl border p-3"
        >
          {options}
        </select>
      </label>
      <label className="block text-sm">
        Número de operación
        {!["cash", "petty_cash"].includes(method) && " obligatorio"}
        <input
          name="operation_number"
          required={!["cash", "petty_cash"].includes(method)}
          className="mt-1 w-full rounded-xl border p-3"
        />
      </label>
      <label className="block text-sm">
        Monto ejecutado
        <input
          type="number"
          name="amount"
          readOnly
          value={amount}
          className="mt-1 w-full rounded-xl border bg-slate-50 p-3"
        />
      </label>
      <label className="block text-sm">
        Comprobante
        <input
          type="file"
          name="receipt"
          required
          accept="application/pdf,image/jpeg,image/png"
          className="mt-1 w-full rounded-xl border p-3"
        />
      </label>
      <label className="block text-sm">
        Observación
        <textarea
          name="notes"
          className="mt-1 min-h-20 w-full rounded-xl border p-3"
        />
      </label>
      <button
        disabled={pending}
        onClick={(e) => {
          if (
            !confirm(
              "¿Confirmas que este pago fue ejecutado? Esta acción es irreversible.",
            )
          )
            e.preventDefault();
        }}
        className="w-full rounded-xl bg-[#173f2d] p-3 font-semibold text-white"
      >
        {pending ? "Registrando…" : "Confirmar pago ejecutado"}
      </button>
    </form>
  );
}
function Message({ state }: { state: PaymentResult }) {
  return (
    <p
      className={`rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
    >
      {state.message}
    </p>
  );
}
