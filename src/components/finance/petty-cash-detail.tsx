import { clp } from "@/modules/finance/petty-cash/domain/petty-cash";
import { uiLabel } from "@/lib/ui-labels";

export function PettyCashExpenseLine({
  line,
  index,
}: {
  line: Record<string, unknown>;
  index: number;
}) {
  const category = one<{ name?: string }>(line.expense_categories);
  const center = one<{ name?: string }>(line.cost_centers);
  const attachments =
    (line.petty_cash_line_attachments as Array<Record<string, unknown>>) ?? [];
  return (
    <article
      className={`rounded-xl border p-4 ${line.review_status === "observed" ? "border-orange-400 bg-orange-50" : ""}`}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <b>
          {index + 1}. {String(line.merchant_name)}
        </b>
        <b>{clp(Number(line.amount))}</b>
      </div>
      <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <span>
          {String(line.expense_date)} ·{" "}
          {documentLabel(String(line.document_type))}{" "}
          {line.document_number ? `N.º ${String(line.document_number)}` : ""}
        </span>
        <span>
          {category?.name} · {center?.name}
        </span>
        <span className="sm:col-span-2">{String(line.description)}</span>
      </div>
      {Boolean(line.reviewer_comment) && (
        <p className="mt-3 rounded-lg bg-orange-100 p-2 text-sm text-orange-900">
          {String(line.reviewer_comment)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <a
            key={String(attachment.id)}
            href={String(attachment.url)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-[#e0eaf6] px-3 py-1.5 text-xs font-semibold text-[#083f7d]"
          >
            Ver {String(attachment.original_name)}
          </a>
        ))}
      </div>
    </article>
  );
}
export function PettyCashReviewHistory({
  actions,
}: {
  actions: Array<Record<string, unknown>>;
}) {
  return (
    <div className="mt-3 space-y-3">
      {actions
        .sort((a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)),
        )
        .map((action) => {
          const reviewer = one<{ first_name?: string; last_name?: string }>(
            action.profiles,
          );
          return (
            <div
              key={String(action.id)}
              className="border-l-2 border-[#0b4f9c] pl-3 text-sm"
            >
              <b>{uiLabel(action.decision)}</b>
              <span className="block text-xs text-slate-500">
                {reviewer?.first_name} {reviewer?.last_name} ·{" "}
                {new Date(String(action.created_at)).toLocaleString("es-CL")}
              </span>
              {Boolean(action.comment) && (
                <p className="mt-1">{String(action.comment)}</p>
              )}
            </div>
          );
        })}
      {!actions.length && (
        <p className="text-sm text-slate-500">Sin decisiones registradas.</p>
      )}
    </div>
  );
}
function one<T>(value: unknown): T | undefined {
  return (Array.isArray(value) ? value[0] : value) as T | undefined;
}
function documentLabel(value: string) {
  return (
    (
      {
        receipt: "Boleta",
        invoice: "Factura",
        voucher: "Recibo",
        electronic_receipt: "Comprobante electrónico",
        other: "Otro",
      } as Record<string, string>
    )[value] ?? value
  );
}
