"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideApprovalAction,
  type DecisionResult,
} from "@/modules/finance/payment-control/application/approval-actions";
export function ApprovalDecisionForm({
  step,
  requestId,
  companyId,
}: {
  step: Record<string, unknown>;
  requestId: string;
  companyId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(decideApprovalAction, {
    success: false,
  } as DecisionResult);
  const [decision, setDecision] = useState<string>("");
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);
  return (
    <div className="rounded-2xl border border-[#b8d3c5] bg-white p-5">
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
      <form action={action} className="mt-4 space-y-4">
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
              className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold ${decision === v ? "border-[#277a55] bg-[#edf5f0]" : ""}`}
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
        <button
          disabled={pending || !decision}
          className="w-full rounded-xl bg-[#173f2d] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Registrando…" : "Confirmar decisión"}
        </button>
      </form>
    </div>
  );
}
