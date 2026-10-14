"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideAndPayAction,
  type PayDecisionResult,
} from "@/modules/finance/payment-control/application/approval-payment-actions";
export function ApprovalDecisionForm({
  step,
  requestId,
  companyId,
  payOnApprove,
}: {
  step: Record<string, unknown>;
  requestId: string;
  companyId: string;
  /**
   * Última etapa y el usuario puede registrar pagos: al aprobar se adjunta el
   * comprobante y el pago queda registrado en el mismo paso.
   */
  payOnApprove?: { amount: number };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(decideAndPayAction, {
    success: false,
  } as PayDecisionResult);
  const [decision, setDecision] = useState<string>("");
  const paying = Boolean(payOnApprove) && decision === "approve";
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);
  return (
    <div className="rounded-2xl border border-[#b0c4db] bg-white p-5">
      <h2 className="font-semibold">Decidir etapa actual</h2>
      <p className="mt-1 text-sm text-slate-600">
        {String(step.step_name_snapshot)}
        {Boolean(step.allow_higher_role_substitution) && (
          <span> · Admite sustitución autorizada</span>
        )}
      </p>
      {state.message && (
        <p
          className={`mt-3 rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
        >
          {state.message}
        </p>
      )}
      <form
        // Se envía a mano para que, si falta algún dato, el comprobante elegido
        // no se borre al volver el formulario.
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
        className="mt-4 space-y-4"
      >
        <input type="hidden" name="step_id" value={String(step.id)} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="company_id" value={companyId} />
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["approve", "Aprobar"],
            ["reject", "Rechazar"],
            ["request_correction", "Solicitar corrección"],
          ].map(([v, l]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold ${decision === v ? "border-[#0b4f9c] bg-[#ebf1f7]" : ""}`}
            >
              <input
                className="sr-only"
                type="radio"
                name="decision"
                value={v}
                required
                onChange={() => setDecision(v)}
              />
              {l}
            </label>
          ))}
        </div>
        <label className="block text-sm font-medium">
          Comentario{Boolean(step.require_comment) ? " obligatorio" : ""}
          <textarea
            name="comment"
            required={Boolean(step.require_comment) || decision !== "approve"}
            className="mt-1.5 min-h-24 w-full rounded-xl border p-3"
            placeholder="Fundamento de la decisión"
          />
        </label>
        {Boolean(step.require_additional_attachment) && (
          <label className="block text-sm font-medium">
            Respaldo adicional obligatorio
            <input
              type="file"
              name="attachments"
              accept="application/pdf,image/jpeg,image/png"
              className="mt-1.5 w-full rounded-xl border p-3"
              required
            />
          </label>
        )}
        {paying && (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <label className="block text-sm font-medium text-emerald-900">
              Comprobante de pago
              <input
                type="file"
                name="receipt"
                accept="application/pdf,image/jpeg,image/png"
                required
                className="mt-1.5 w-full rounded-xl border bg-white p-3"
              />
            </label>
            <p className="text-xs text-emerald-800">
              El sistema lee la fecha, el monto y la operación del comprobante y
              deja el pago registrado: la solicitud queda pagada, sin otro paso.
            </p>
            {state.needs?.date && (
              <label className="block text-sm font-medium text-emerald-900">
                Fecha del pago (no se pudo leer)
                <input
                  type="datetime-local"
                  name="paid_at"
                  required
                  className="mt-1.5 w-full rounded-xl border bg-white p-3"
                />
              </label>
            )}
            {(state.needs?.amountMismatch || state.needs?.amountUnknown) && (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                <input type="checkbox" name="confirm_amount" required className="mt-1" />
                <span>
                  Confirmo que el comprobante corresponde al monto aprobado
                  {payOnApprove ? ` (${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(payOnApprove.amount)})` : ""}.
                </span>
              </label>
            )}
          </div>
        )}
        <button
          disabled={pending || !decision}
          className="w-full rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? paying
              ? "Leyendo comprobante y registrando…"
              : "Registrando…"
            : paying
              ? "Aprobar y registrar pago"
              : "Confirmar decisión"}
        </button>
      </form>
    </div>
  );
}
