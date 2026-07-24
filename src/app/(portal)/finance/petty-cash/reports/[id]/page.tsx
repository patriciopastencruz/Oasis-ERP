import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { StatusBadge } from "@/components/finance/status-badge";
import {
  DeletePettyCashAttachment,
  SubmitPettyCashReport,
} from "@/components/finance/petty-cash-actions";
import { PettyCashReportForm } from "@/components/finance/petty-cash-report-form";
import {
  PettyCashExpenseLine,
  PettyCashReviewHistory,
} from "@/components/finance/petty-cash-detail";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  activeCatalogs,
  currentWeekSummary,
  loadPettyCashReport,
  signPettyCashAttachments,
} from "@/modules/finance/petty-cash/application/queries";
import {
  clp,
  formatWeek,
} from "@/modules/finance/petty-cash/domain/petty-cash";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PettyCashReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const report = await loadPettyCashReport(id);
  if (!report) notFound();
  const lines = await signPettyCashAttachments(
    report as Record<string, unknown>,
  );
  const supabase = await createSupabaseServerClient();
  const { data: audit } = ctx.permissions.has("audit.logs.view")
    ? await supabase
        .from("audit_logs")
        .select("id,action,entity_type,created_at,actor_id")
        .eq("entity_type", "petty_cash_reports")
        .eq("entity_id", id)
        .order("created_at")
    : { data: [] };
  const editable =
    report.responsible_id === ctx.user.id &&
    ["draft", "correction_requested"].includes(report.status);
  const unit = one<{ name?: string }>(report.business_units);
  const responsible = one<{ first_name?: string; last_name?: string }>(
    report.responsible,
  );
  if (editable) {
    const [{ categories, centers }, summary] = await Promise.all([
      activeCatalogs(),
      currentWeekSummary(report.business_unit_id, undefined, report.week_start),
    ]);
    const capacity =
      Number(summary?.available ?? 0) +
      (report.status === "correction_requested"
        ? Number(report.total_registered)
        : 0);
    return (
      <>
        <PageHeader
          title={report.report_number ?? "Editar borrador"}
          description="Guarda tus cambios y envía la rendición cuando cada gasto tenga su comprobante."
          eyebrow="Finanzas · Caja Chica"
        />
        {report.reviewer_comment && (
          <p className="mb-5 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            <b>Corrección solicitada:</b> {report.reviewer_comment}
            <span className="mt-1 block">
              Revisión N.º {report.revision_number}
            </span>
          </p>
        )}
        <div className="mb-5 flex items-center justify-between">
          <StatusBadge value={report.status} />
          <Link
            href="/finance/petty-cash/my-reports"
            className="text-sm font-semibold text-[#0b4f9c]"
          >
            Volver
          </Link>
        </div>
        <PettyCashReportForm
          report={{ ...report, petty_cash_expense_lines: lines }}
          units={ctx.units}
          categories={categories}
          centers={centers}
          week={{ start: report.week_start, end: report.week_end }}
          weeklySummary={summary ? { ...summary, available: capacity } : null}
        />
        <Panel className="mt-5">
          <h2 className="font-semibold">Comprobantes guardados</h2>
          <div className="mt-3 space-y-3">
            {lines.flatMap((line) =>
              (
                (line.petty_cash_line_attachments as Array<
                  Record<string, unknown>
                >) ?? []
              ).map((attachment) => (
                <div
                  key={String(attachment.id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                >
                  <a
                    href={String(attachment.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#0b4f9c]"
                  >
                    {String(attachment.original_name)}
                  </a>
                  <DeletePettyCashAttachment id={String(attachment.id)} />
                </div>
              )),
            )}
            {!lines.some(
              (line) =>
                ((line.petty_cash_line_attachments as unknown[]) ?? []).length,
            ) && (
              <p className="text-sm text-slate-500">
                Aún no hay comprobantes guardados.
              </p>
            )}
          </div>
        </Panel>
        <div className="mt-5">
          <SubmitPettyCashReport
            id={id}
            total={Number(report.total_registered)}
            available={capacity}
          />
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={report.report_number ?? "Rendición"}
        description="Detalle, comprobantes e historial de la rendición."
        eyebrow="Finanzas · Caja Chica"
      />
      <div className="mb-5 flex items-center justify-between">
        <StatusBadge value={report.status} />
        <Link
          href="/finance/petty-cash/my-reports"
          className="text-sm font-semibold text-[#0b4f9c]"
        >
          Volver
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Panel>
            <h2 className="font-semibold">Información general</h2>
            <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <Info
                label="Responsable"
                value={`${responsible?.first_name ?? ""} ${responsible?.last_name ?? ""}`}
              />
              <Info label="Unidad" value={unit?.name} />
              <Info
                label="Semana"
                value={formatWeek(report.week_start, report.week_end)}
              />
              <Info label="Revisión" value={`N.º ${report.revision_number}`} />
              <Info label="Motivo" value={report.general_reason} />
              <Info label="Total" value={clp(report.total_registered)} />
            </dl>
            {report.general_observations && (
              <p className="mt-4 border-t pt-4 text-sm">
                {report.general_observations}
              </p>
            )}
          </Panel>
          <Panel>
            <h2 className="font-semibold">Gastos y comprobantes</h2>
            <div className="mt-4 space-y-4">
              {lines.map((line, index) => (
                <PettyCashExpenseLine
                  key={String(line.id)}
                  line={line}
                  index={index}
                />
              ))}
            </div>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel>
            <h2 className="font-semibold">Timeline</h2>
            <Timeline report={report as Record<string, unknown>} />
          </Panel>
          <Panel>
            <h2 className="font-semibold">Historial de revisión</h2>
            <PettyCashReviewHistory
              actions={
                (report.petty_cash_review_actions as Array<
                  Record<string, unknown>
                >) ?? []
              }
            />
          </Panel>
          {Boolean(audit?.length) && (
            <Panel>
              <h2 className="font-semibold">Auditoría</h2>
              <div className="mt-3 space-y-2 text-xs">
                {audit?.map((item) => (
                  <p key={item.id}>
                    <b>{uiLabel(item.action)}</b> · {uiLabel(item.entity_type)}{" "}
                    · {new Date(item.created_at).toLocaleString("es-CL")}
                  </p>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
function Timeline({ report }: { report: Record<string, unknown> }) {
  const items = [
    { label: "Creada", date: report.created_at },
    { label: "Enviada", date: report.submitted_at },
    { label: "Corrección solicitada", date: report.correction_requested_at },
    { label: "Aprobada", date: report.approved_at },
    { label: "Rechazada", date: report.rejected_at },
  ].filter((item) => item.date);
  return (
    <ol className="mt-3 space-y-3">
      {items.map((item) => (
        <li
          key={item.label}
          className="border-l-2 border-emerald-600 pl-3 text-sm"
        >
          <b>{item.label}</b>
          <span className="block text-xs text-slate-500">
            {new Date(String(item.date)).toLocaleString("es-CL")}
          </span>
        </li>
      ))}
    </ol>
  );
}
function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium">{String(value ?? "—")}</dd>
    </div>
  );
}
function one<T>(value: unknown): T | undefined {
  return (Array.isArray(value) ? value[0] : value) as T | undefined;
}
