"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAttachmentAction,
  previewWorkflowAction,
  submitPaymentRequestAction,
} from "@/modules/finance/payment-control/application/actions";

export function SubmitRequest({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const inspect = () =>
    start(async () => {
      const r = await previewWorkflowAction(id);
      if (r.success) setPreview(r.data as Record<string, unknown>);
      else setMessage(r.message ?? "No fue posible previsualizar");
    });
  const submit = () =>
    start(async () => {
      const r = await submitPaymentRequestAction(id);
      setMessage(r.message ?? "");
      if (r.success) {
        setPreview(null);
        router.refresh();
      }
    });
  return (
    <div>
      {message && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {message}
        </p>
      )}
      <button
        onClick={inspect}
        disabled={pending}
        className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white"
      >
        {pending ? "Procesando…" : "Enviar a aprobación"}
      </button>
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-[#0b4f9c]">
              Confirmación
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {String(preview.name)}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Código {String(preview.code)} · Política{" "}
              {String(preview.correction_policy)}
            </p>
            <div className="mt-5 space-y-2">
              {(preview.steps as Array<Record<string, unknown>>).map(
                (step, i) => (
                  <div
                    key={String(step.id)}
                    className="rounded-xl border p-3 text-sm"
                  >
                    <b>
                      {i + 1}. {String(step.name)}
                    </b>
                    <span className="block text-xs text-slate-500">
                      {String(step.required_role)} ·{" "}
                      {step.execution_mode === "parallel"
                        ? "Paralela"
                        : "Secuencial"}
                    </span>
                  </div>
                ),
              )}
            </div>
            <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm">
              Al confirmar se generará el correlativo y el flujo de aprobación
              quedará congelado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-xl border px-4 py-2"
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="rounded-xl bg-[#083f7d] px-4 py-2 text-white"
              >
                Confirmar envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function DeleteAttachment({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("¿Eliminar este respaldo?"))
            start(async () => {
              const r = await deleteAttachmentAction(id);
              if (r.success) router.refresh();
              else setError(r.message ?? "No fue posible eliminar");
            });
        }}
        className="text-xs font-semibold text-red-700"
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </div>
  );
}
