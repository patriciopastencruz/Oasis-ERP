import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { RequestForm, type FormRow } from "@/components/supply/request-form";
import { field, StatusBadge } from "@/components/supply/supply-ui";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import { Notice } from "@/modules/inventory/ui";
import {
  getRequest,
  loadCatalog,
  loadMyProjects,
  personName,
  SUPPLY_CONSOLIDATE,
  SUPPLY_REQUEST,
  supplyContext,
} from "@/modules/inventory/supply/application/queries";
import { cancelRequestAction, saveRequestAction } from "@/modules/inventory/supply/application/actions";
import {
  formatCoverWindow,
  isRequestCancellable,
  isRequestEditable,
  quantityFormat,
  requestStatusLabels,
  type SupplyRequestStatus,
} from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { ctx, supabase, canRequest, canConsolidate } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE);
  const request = await getRequest(supabase, id);
  if (!request) notFound();

  const mine = request.requested_by === ctx.user.id;
  const editable = isRequestEditable(request.status) && canRequest && (mine || canConsolidate);
  const cancellable = isRequestCancellable(request.status) && (mine || canConsolidate);
  const projectLabel = [request.project?.project_number, request.project?.name].filter(Boolean).join(" · ") || "Proyecto";
  const today = santiagoToday();

  let editor = null;
  if (editable) {
    const [catalog, projects] = await Promise.all([loadCatalog(supabase), loadMyProjects(supabase)]);
    const rows: FormRow[] = (request.lines ?? []).map((l) => ({
      key: l.id,
      materialId: l.material_id ?? "__other",
      customName: l.material_id ? "" : l.name,
      unit: l.unit,
      quantity: String(l.quantity).replace(".", ","),
      note: l.note ?? "",
    }));
    editor = (
      <RequestForm
        action={saveRequestAction}
        catalog={catalog}
        projects={projects}
        today={today}
        mode={request.status === "submitted" ? "update" : "send"}
        initial={{
          requestId: request.id,
          projectId: request.project_id,
          from: request.cover_from < today ? today : request.cover_from,
          to: request.cover_to < today ? today : request.cover_to,
          urgent: request.urgent,
          urgentReason: request.urgent_reason ?? "",
          notes: request.notes ?? "",
          rows,
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title={projectLabel}
        description={`Pedido para el ${formatCoverWindow(request.cover_from, request.cover_to)} · ${personName(request.requester_name)}`}
      />
      <Notice {...q} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} label={requestStatusLabels[request.status as SupplyRequestStatus]} />
        {request.urgent && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
        {request.purchase_list_id && canConsolidate && (
          <Link href={`/supply/lists/${request.purchase_list_id}`} className="text-sm font-semibold text-[#0b4f9c]">
            Ver la lista de compras
          </Link>
        )}
      </div>
      {request.urgent && request.urgent_reason && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Urgente: {request.urgent_reason}</p>}
      {request.status === "cancelled" && request.cancel_reason && (
        <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Anulado: {request.cancel_reason}</p>
      )}

      {editor ?? (
        <Panel>
          {request.status === "in_list" && (
            <p className="mb-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Bodega ya incluyó este pedido en una lista de compras. Si necesitas cambiar algo, avísale.</p>
          )}
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1.5">Material</th>
                <th className="text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {request.lines?.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5">
                    {l.name}
                    {l.note && <span className="block text-xs text-slate-500">{l.note}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium">
                    {quantityFormat(l.quantity)} {l.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {request.notes && <p className="mt-3 border-t pt-3 text-sm text-slate-600">Comentario: {request.notes}</p>}
        </Panel>
      )}

      {cancellable && (
        <Panel className="mt-5">
          <h2 className="text-sm font-semibold">{request.status === "draft" ? "Descartar borrador" : "Anular pedido"}</h2>
          <form action={cancelRequestAction} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="id" value={request.id} />
            <input name="reason" required={request.status === "submitted"} minLength={request.status === "submitted" ? 3 : undefined} maxLength={500} placeholder="Motivo" className={field} />
            <button className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">
              {request.status === "draft" ? "Descartar" : "Anular"}
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
