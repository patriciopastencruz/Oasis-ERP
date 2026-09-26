import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { ClosingReport } from "@/components/lodging/closing-report";
import { ClosingExecutive } from "@/components/lodging/closing-executive";
import { ClosingShare } from "@/components/lodging/closing-share";
import { getBusinessUnitBrand } from "@/config/business-units";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { loadClosing } from "@/modules/lodging/application/closing-queries";
import {
  deleteClosingAction,
  issueClosingAction,
  resendClosingEmailAction,
} from "@/modules/lodging/application/closing-actions";
import { clp, formatClosingDate, pct } from "@/modules/lodging/domain/daily-closing";

export default async function ClosingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { ctx, unit, supabase } = await lodgingContext([
    "lodging.closings.create",
    "lodging.closings.reports",
  ]);
  const loaded = await loadClosing(supabase, id);
  if (!loaded || loaded.closing.business_unit_id !== unit.id) notFound();
  const { closing, expenses, history, issuedBy } = loaded;
  const canManage = ctx.permissions.has("lodging.closings.manage");
  const canCreate = ctx.permissions.has("lodging.closings.create");
  const issued = closing.status === "issued";
  const date = formatClosingDate(closing.closing_date);
  const message = [
    `*Cierre diario ${unit.name} - ${date}*`,
    `Ocupación: ${closing.occupied_rooms}/${closing.total_rooms} (${pct(closing.occupancy_pct)})`,
    `Monto total: ${clp(closing.total_received)}`,
    `Gasto total: ${clp(closing.expense_total)}`,
    `Monto pendiente: ${clp(closing.pending_amount)}`,
    closing.observations ? `Obs.: ${closing.observations}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title={`Cierre diario ${date}`}
        description={
          issued
            ? "Cierre emitido. Compártelo en el grupo de WhatsApp o descárgalo en PDF."
            : "Revisa la vista previa. Al generar el PDF el cierre queda emitido y se envía por correo a administración."
        }
      />
      {(q.error || q.success) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <ClosingExecutive
            unitName={unit.name}
            unitLogo={getBusinessUnitBrand(unit.code).logo}
            closing={closing}
            history={history}
          />
          <details className="group rounded-2xl border bg-white">
            <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-[#0b4f9c] [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Ver detalle de pagos, saldos y gastos</span>
              <span className="hidden group-open:inline">Ocultar detalle</span>
            </summary>
            <div className="border-t p-3">
              <ClosingReport
                unitName={unit.name}
                unitLogo={getBusinessUnitBrand(unit.code).logo}
                closing={closing}
                expenses={expenses}
              />
            </div>
          </details>
        </div>
        <div className="space-y-4">
          <Panel>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p>
            <p className={`mt-1 text-lg font-semibold ${issued ? "text-emerald-700" : "text-amber-700"}`}>
              {issued ? "Emitido" : "Borrador"}
            </p>
            {issued && closing.issued_at && (
              <p className="text-xs text-slate-500">
                {new Date(closing.issued_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}
                {issuedBy ? ` · ${issuedBy}` : ""}
              </p>
            )}
            {issued && (
              <p className="mt-2 text-xs text-slate-500">
                {closing.email_sent_at
                  ? `Correo enviado a: ${(closing.email_recipients ?? []).join(", ")}`
                  : "El correo a administración aún no se ha enviado."}
              </p>
            )}
          </Panel>

          <Panel className="space-y-3">
            {issued ? (
              <>
                <ClosingShare
                  pdfUrl={`/api/lodging/closing/${closing.id}/pdf`}
                  filename={`cierre-${unit.code.toLowerCase()}-${closing.closing_date}.pdf`}
                  message={message}
                />
                {canCreate && (
                <form action={resendClosingEmailAction}>
                  <input type="hidden" name="id" value={closing.id} />
                  <button className="text-sm font-semibold text-[#0b4f9c]">Reenviar correo a administración</button>
                </form>
                )}
                {canManage && (
                  <Link href={`/lodging/closing?date=${closing.closing_date}`} className="block text-sm font-semibold text-slate-600">
                    Corregir cierre
                  </Link>
                )}
              </>
            ) : !canCreate ? (
              <p className="text-sm text-slate-500">Cierre en borrador, pendiente de emisión por recepción.</p>
            ) : (
              <>
                <form action={issueClosingAction}>
                  <input type="hidden" name="id" value={closing.id} />
                  <ConfirmButton
                    message="¿Generar el cierre? Quedará emitido, se recalcularán los indicadores con los pagos vigentes y se enviará por correo a administración."
                    className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3 text-sm font-semibold text-white"
                  >
                    Generar PDF y enviar
                  </ConfirmButton>
                </form>
                <Link
                  href={`/lodging/closing?date=${closing.closing_date}`}
                  className="block rounded-xl border px-4 py-2.5 text-center text-sm font-semibold"
                >
                  Editar gastos y observaciones
                </Link>
              </>
            )}
          </Panel>
          {canManage && (
            <Panel>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-red-700">Eliminar cierre</summary>
                <form action={deleteClosingAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={closing.id} />
                  <p className="text-xs text-slate-500">
                    Se borra el cierre y sus gastos; las reservas y pagos no cambian. La fecha queda libre para un
                    nuevo cierre y la eliminación queda registrada en la auditoría.
                  </p>
                  <input
                    name="reason"
                    required
                    minLength={3}
                    maxLength={300}
                    placeholder="Motivo de la eliminación"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <ConfirmButton
                    message={`¿Eliminar el cierre del ${date}? Esta acción no se puede deshacer.`}
                    className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Eliminar cierre
                  </ConfirmButton>
                </form>
              </details>
            </Panel>
          )}
          <Link href="/lodging/closing" className="block text-center text-sm text-slate-500">
            Volver al cierre diario
          </Link>
        </div>
      </div>
    </>
  );
}
