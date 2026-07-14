"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Copy, FileText, Plus, Trash2 } from "lucide-react";
import {
  deletePettyCashAttachmentAction,
  preparePettyCashAttachmentAction,
  savePettyCashDraftAction,
} from "@/modules/finance/petty-cash/application/actions";
import type { PettyCashActionResult } from "@/modules/finance/petty-cash/application/schemas";
import { validateReceipt } from "@/modules/finance/petty-cash/application/schemas";
import { clp, documentTypes } from "@/modules/finance/petty-cash/domain/petty-cash";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Unit = { id: string; name: string; company_id: string };
type Catalog = { id: string; name: string; company_id: string; business_unit_id: string | null };
type Attachment = { id: string; original_name: string; url?: string | null };
type UploadTarget = { client_id: string; line_id: string; report_id: string };
type Line = {
  id?: string;
  client_id: string;
  expense_date: string;
  merchant_name: string;
  document_type: string;
  document_number: string;
  expense_category_id: string;
  cost_center_id: string;
  description: string;
  amount: number | string;
  observation: string;
  sort_order: number;
  review_status?: string;
  reviewer_comment?: string | null;
  attachments?: Attachment[];
};

const input = "mt-1.5 w-full rounded-xl border border-[#d8e1dc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#277a55]";
function blankLine(date: string, index: number): Line {
  return {
    client_id: crypto.randomUUID(), expense_date: date, merchant_name: "", document_type: "receipt",
    document_number: "", expense_category_id: "", cost_center_id: "", description: "", amount: "",
    observation: "", sort_order: index, attachments: [],
  };
}

export function PettyCashReportForm({
  report, units, categories, centers, week, weeklySummary, weeklySummaries,
}: {
  report?: Record<string, unknown>;
  units: Unit[];
  categories: Catalog[];
  centers: Catalog[];
  week: { start: string; end: string };
  weeklySummary?: { weekly_limit?: number; committed?: number; available?: number } | null;
  weeklySummaries?: Record<string, { weekly_limit?: number; committed?: number; available?: number } | null>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(savePettyCashDraftAction, { success: false, message: "" } as PettyCashActionResult);
  const handledState = useRef<PettyCashActionResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const initialLines = ((report?.petty_cash_expense_lines as Array<Record<string, unknown>> | undefined) ?? []).map((line, index) => ({
    ...line,
    client_id: String(line.id ?? crypto.randomUUID()),
    amount: Number(line.amount),
    sort_order: index,
    attachments: (line.petty_cash_line_attachments as Attachment[] | undefined) ?? [],
  })) as Line[];
  const [unitId, setUnitId] = useState(String(report?.business_unit_id ?? units[0]?.id ?? ""));
  const [lines, setLines] = useState<Line[]>(initialLines.length ? initialLines : [blankLine(week.start, 0)]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0), [lines]);
  const selectedSummary = weeklySummaries?.[unitId] ?? weeklySummary;
  const available = Number(selectedSummary?.available ?? selectedSummary?.weekly_limit ?? 100000);
  useEffect(() => {
    if (!state.success || !state.id || handledState.current === state) return;
    handledState.current = state;
    const files = selectedFiles;
    const targets = ((state.data as { uploadTargets?: UploadTarget[] } | undefined)?.uploadTargets ?? []);
    const uploadReceipts = async () => {
      setUploadError("");
      setUploading(true);
      try {
        const totalFiles = Object.values(files).reduce((sum, current) => sum + current.length, 0);
        if (totalFiles) setUploadMessage(`Subiendo ${totalFiles} comprobante(s)…`);
        const supabase = createSupabaseBrowserClient();
        for (const target of targets) {
          for (const file of files[target.client_id] ?? []) {
            const prepared = await preparePettyCashAttachmentAction({
              report_id: target.report_id,
              expense_line_id: target.line_id,
              original_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
            });
            if (!prepared.success) throw new Error(prepared.message);
            const preparedData = prepared.data as { attachment_id?: string; object_path?: string } | undefined;
            if (!prepared.id || !preparedData?.object_path) throw new Error("No fue posible preparar el comprobante.");
            const { error } = await supabase.storage
              .from("petty-cash-attachments")
              .upload(preparedData.object_path, file, { contentType: file.type, upsert: false });
            if (error) {
              await deletePettyCashAttachmentAction(prepared.id);
              throw new Error("No fue posible subir uno de los comprobantes. Intenta nuevamente.");
            }
          }
        }
        setSelectedFiles({});
        setFileInputVersion((value) => value + 1);
        setUploadMessage(totalFiles ? "Borrador y comprobantes guardados correctamente." : state.message);
        if (!report?.id) router.push(`/finance/petty-cash/reports/${state.id}`);
        else router.refresh();
      } catch (error) {
        setUploadMessage("");
        setUploadError(error instanceof Error ? error.message : "No fue posible guardar los comprobantes.");
      } finally {
        setUploading(false);
      }
    };
    void uploadReceipts();
  }, [state, report, router, selectedFiles]);

  const visibleCategories = categories.filter((item) => !item.business_unit_id || item.business_unit_id === unitId);
  const visibleCenters = centers.filter((item) => !item.business_unit_id || item.business_unit_id === unitId);
  const update = (index: number, key: keyof Line, value: string | number) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  const remove = (index: number) => {
    if (lines.length === 1) return;
    if (confirm("¿Eliminar esta línea de gasto?")) setLines((current) => current.filter((_, i) => i !== index));
  };
  const duplicate = (index: number) => setLines((current) => [
    ...current,
    { ...current[index], id: undefined, client_id: crypto.randomUUID(), document_number: "", attachments: [], sort_order: current.length },
  ]);
  const linePayload = lines.map((line, index) => ({
    id: line.id, client_id: line.client_id, expense_date: line.expense_date,
    merchant_name: line.merchant_name, document_type: line.document_type,
    document_number: line.document_number, expense_category_id: line.expense_category_id,
    cost_center_id: line.cost_center_id, description: line.description, amount: line.amount,
    observation: line.observation, sort_order: index,
  }));

  return (
    <form action={action} className="space-y-5" onSubmit={(event) => {
      const form = event.currentTarget;
      if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); }
      for (const files of Object.values(selectedFiles)) {
        for (const file of files) {
          const invalid = validateReceipt(file);
          if (invalid) {
            event.preventDefault();
            setUploadError(invalid);
            return;
          }
        }
      }
      setUploadError("");
      setUploadMessage("");
    }}>
      <input type="hidden" name="id" value={String(report?.id ?? "")} />
      <input type="hidden" name="week_start" value={String(report?.week_start ?? week.start)} />
      <input type="hidden" name="week_end" value={String(report?.week_end ?? week.end)} />
      <input type="hidden" name="lines" value={JSON.stringify(linePayload)} />
      {state.message && <p className={`rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      {state.fieldErrors?.lines?.[0] && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.fieldErrors.lines[0]}</p>}
      {uploadMessage && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{uploadMessage}</p>}
      {uploadError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{uploadError}</p>}

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Datos de la rendición</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Unidad de negocio">
            <select name="business_unit_id" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={Boolean(report?.id)} required className={input}>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            {Boolean(report?.id) && <input type="hidden" name="business_unit_id" value={unitId} />}
          </Field>
          <Field label="Semana">
            <input readOnly value={`${String(report?.week_start ?? week.start)} al ${String(report?.week_end ?? week.end)}`} className={`${input} bg-slate-50`} />
          </Field>
          <div className="md:col-span-2"><Field label="Motivo general" error={state.fieldErrors?.general_reason?.[0]}>
            <input name="general_reason" defaultValue={String(report?.general_reason ?? "")} minLength={3} maxLength={500} required className={input} placeholder="Ej.: Gastos operacionales de la semana" />
          </Field></div>
          <div className="md:col-span-2"><Field label="Observaciones generales (opcional)"><textarea name="general_observations" defaultValue={String(report?.general_observations ?? "")} maxLength={1000} rows={3} className={input} /></Field></div>
        </div>
      </section>

      <div className="sticky top-3 z-10 grid grid-cols-3 gap-2 rounded-2xl border bg-white/95 p-3 text-center text-xs shadow-lg backdrop-blur md:ml-auto md:max-w-xl">
        <Metric label="Total borrador" value={clp(total)} danger={total > available} />
        <Metric label="Saldo disponible" value={clp(available)} />
        <Metric label="Saldo proyectado" value={clp(Math.max(0, available - total))} danger={total > available} />
      </div>
      {total > available && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">El borrador supera el saldo semanal. Puedes guardarlo, pero no podrás enviarlo hasta ajustar el total.</p>}

      <div className="space-y-4">
        {lines.map((line, index) => (
          <section key={line.client_id} className={`rounded-2xl border bg-white p-4 md:p-5 ${line.review_status === "observed" ? "border-orange-400" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Gasto {index + 1}</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => duplicate(index)} className="rounded-lg border p-2" title="Duplicar línea"><Copy size={16} /></button>
                <button type="button" onClick={() => remove(index)} disabled={lines.length === 1} className="rounded-lg border p-2 text-red-700 disabled:opacity-30" title="Eliminar línea"><Trash2 size={16} /></button>
              </div>
            </div>
            {line.reviewer_comment && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900"><b>Observación del revisor:</b> {line.reviewer_comment}</p>}
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Fecha del gasto"><input type="date" value={line.expense_date} min={String(report?.week_start ?? week.start)} max={String(report?.week_end ?? week.end)} onChange={(e) => update(index, "expense_date", e.target.value)} required className={input} /></Field>
              <Field label="Comercio o proveedor"><input value={line.merchant_name} onChange={(e) => update(index, "merchant_name", e.target.value)} minLength={2} required className={input} /></Field>
              <Field label="Tipo de documento"><select value={line.document_type} onChange={(e) => update(index, "document_type", e.target.value)} className={input}>{documentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Número de documento (opcional)"><input value={line.document_number} onChange={(e) => update(index, "document_number", e.target.value)} className={input} /></Field>
              <Field label="Categoría"><select value={line.expense_category_id} onChange={(e) => update(index, "expense_category_id", e.target.value)} required className={input}><option value="">Selecciona</option>{visibleCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Centro de costo"><select value={line.cost_center_id} onChange={(e) => update(index, "cost_center_id", e.target.value)} required className={input}><option value="">Selecciona</option>{visibleCenters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <div className="xl:col-span-2"><Field label="Descripción"><input value={line.description} onChange={(e) => update(index, "description", e.target.value)} minLength={3} maxLength={500} required className={input} /></Field></div>
              <Field label="Monto CLP"><input type="number" min="1" step="1" value={line.amount} onChange={(e) => update(index, "amount", e.target.value)} required className={input} /></Field>
              <div className="md:col-span-2"><Field label="Observación (opcional)"><input value={line.observation} onChange={(e) => update(index, "observation", e.target.value)} maxLength={500} className={input} /></Field></div>
              <Field label={`Comprobante ${line.attachments?.length ? "adicional" : "obligatorio al enviar"}`}>
                <input
                  key={`${line.client_id}-${fileInputVersion}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  capture="environment"
                  multiple
                  onChange={(event) => setSelectedFiles((current) => ({
                    ...current,
                    [line.client_id]: Array.from(event.target.files ?? []),
                  }))}
                  className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-[#e4f2ea] file:px-3 file:py-1 file:text-[#173f2d]`}
                />
              </Field>
            </div>
            {(Boolean(line.attachments?.length) || Boolean(selectedFiles[line.client_id]?.length)) && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vista previa de comprobantes</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(line.attachments ?? []).map((attachment) => (
                    <a key={attachment.id} href={attachment.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs font-medium text-[#173f2d]">
                      <FileText size={18} />
                      <span className="truncate">{attachment.original_name}</span>
                    </a>
                  ))}
                  {(selectedFiles[line.client_id] ?? []).map((file) => <ReceiptPreview key={`${file.name}-${file.size}-${file.lastModified}`} file={file} />)}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      <button type="button" onClick={() => setLines((current) => [...current, blankLine(String(report?.week_start ?? week.start), current.length)])} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm font-semibold text-[#277a55]"><Plus size={18} /> Agregar otro gasto</button>
      <div className="flex justify-end"><button disabled={pending || uploading} className="rounded-xl bg-[#173f2d] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{uploading ? "Subiendo comprobantes…" : pending ? "Guardando…" : "Guardar borrador"}</button></div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}
function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div><span className="block text-slate-500">{label}</span><b className={`mt-1 block text-sm md:text-base ${danger ? "text-red-700" : "text-[#173f2d]"}`}>{value}</b></div>;
}

function ReceiptPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (file.type.startsWith("image/")) {
    return <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs font-medium text-[#173f2d]"><span className="relative h-10 w-10 overflow-hidden rounded-md bg-slate-100"><Image src={url} alt="Vista previa del comprobante" fill unoptimized className="object-cover" /></span><span className="truncate">{file.name}</span></a>;
  }
  return <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs font-medium text-[#173f2d]"><FileText size={18} /><span className="truncate">{file.name}</span></a>;
}
