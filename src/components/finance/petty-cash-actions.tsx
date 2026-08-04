"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decidePettyCashReportAction,
  deletePettyCashAttachmentAction,
  deletePettyCashReportAction,
  submitPettyCashReportAction,
} from "@/modules/finance/petty-cash/application/actions";

export function SubmitPettyCashReport({ id, total, available }: { id: string; total: number; available: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const exceedsLimit = total > available;
  const clpAmount = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
  return <div>
    {exceedsLimit && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">Esta rendición supera el saldo semanal disponible ({clpAmount(available)}) por {clpAmount(total - available)}. Igual puedes enviarla; quedará marcada en rojo para que finanzas la revise.</p>}
    {message && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    <button type="button" disabled={pending} onClick={() => {
      const confirmMessage = exceedsLimit
        ? `Esta rendición por ${clpAmount(total)} supera el saldo semanal disponible. ¿Enviarla de todas formas?`
        : `¿Enviar esta rendición por ${clpAmount(total)}?`;
      if (!confirm(confirmMessage)) return;
      start(async () => { const result = await submitPettyCashReportAction(id); setMessage(result.message); if (result.success) router.refresh(); });
    }} className="rounded-xl bg-[#083f7d] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Enviando…" : "Enviar rendición"}
    </button>
  </div>;
}

export function DeletePettyCashAttachment({ id }: { id: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  return <span><button type="button" disabled={pending} onClick={() => {
    if (!confirm("¿Eliminar este comprobante?")) return;
    start(async () => { const result = await deletePettyCashAttachmentAction(id); if (result.success) router.refresh(); else setMessage(result.message); });
  }} className="text-xs font-semibold text-red-700">{pending ? "Eliminando…" : "Eliminar"}</button>{message && <span className="ml-2 text-xs text-red-600">{message}</span>}</span>;
}

export function DeletePettyCashReport({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState("");
  return <span><button type="button" disabled={pending} onClick={() => {
    if (!confirm("¿Eliminar esta rendición en borrador? Esta acción no se puede deshacer.")) return;
    start(async () => {
      const result = await deletePettyCashReportAction(id);
      if (result.success) { if (redirectTo) router.push(redirectTo); else router.refresh(); }
      else setMessage(result.message);
    });
  }} className="text-sm font-semibold text-red-700">{pending ? "Eliminando…" : "Borrar borrador"}</button>{message && <span className="ml-2 text-xs text-red-600">{message}</span>}</span>;
}

export function PettyCashDecisionForm({ id, lines, canApprove }: { id: string; lines: Array<{ id: string; label: string }>; canApprove: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [comment, setComment] = useState(""); const [observed, setObserved] = useState<string[]>([]); const [message, setMessage] = useState("");
  const decide = (decision: "approved" | "rejected" | "correction_requested" | "comment") => {
    if (["rejected", "correction_requested"].includes(decision) && !comment.trim()) { setMessage("Debes ingresar un comentario."); return; }
    if (decision === "correction_requested" && !observed.length) { setMessage("Marca al menos una línea observada."); return; }
    if (decision !== "comment" && !confirm("¿Confirmas esta decisión?")) return;
    start(async () => { const result = await decidePettyCashReportAction(id, decision, comment, observed); setMessage(result.message); if (result.success) { setComment(""); router.refresh(); } });
  };
  return <div className="space-y-4">
    <div><label className="text-sm font-medium">Comentario</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border p-3 text-sm" placeholder="Obligatorio para rechazo o corrección" /></div>
    <fieldset><legend className="text-sm font-medium">Líneas observadas</legend><div className="mt-2 space-y-2">{lines.map((line) => <label key={line.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={observed.includes(line.id)} onChange={(e) => setObserved((current) => e.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} />{line.label}</label>)}</div></fieldset>
    {message && <p className="rounded-xl bg-amber-50 p-3 text-sm">{message}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {canApprove && <button disabled={pending} onClick={() => decide("approved")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Aprobar</button>}
      <button disabled={pending} onClick={() => decide("correction_requested")} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Solicitar corrección</button>
      <button disabled={pending} onClick={() => decide("rejected")} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white">Rechazar</button>
      <button disabled={pending || !comment.trim()} onClick={() => decide("comment")} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Agregar comentario</button>
    </div>
  </div>;
}
