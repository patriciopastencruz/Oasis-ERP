/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/finance/status-badge";
import { QuotationForm } from "@/components/sales/quotation-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { clp } from "@/modules/sales/quotations/domain/quotation";
import {
  markDeliveredAction,
  submitQuotationAction,
  updateQuotationAction,
} from "@/modules/sales/quotations/application/actions";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { Notice } from "@/modules/sales/ui";

export default async function QuotationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { ctx, supabase } = await salesContext("sales.quotations.create");
  const [quotationResult, linesResult] = await Promise.all([
    supabase
      .from("om_quotations")
      .select(
        "*,reviewer:profiles!om_quotations_reviewed_by_fkey(first_name,last_name),seller:profiles!om_quotations_created_by_fkey(first_name,last_name)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("om_quotation_lines")
      .select("description,quantity,unit_price,line_total")
      .eq("quotation_id", id)
      .order("position"),
  ]);
  const quotation = quotationResult.data;
  if (!quotation) notFound();
  const lines = linesResult.data ?? [];
  const isOwner = quotation.created_by === ctx.user.id;
  const editable = isOwner && ["draft", "rejected"].includes(quotation.status);
  const seller = quotation.seller;
  const reviewer = quotation.reviewer;

  return (
    <>
      <div className="mb-4">
        <Link
          href="/sales/quotations"
          className="text-sm font-semibold text-[var(--oasis-primary)]"
        >
          ← Volver a cotizaciones
        </Link>
      </div>
      <PageHeader
        eyebrow="Oasis Modulares · Cotizaciones"
        title={quotation.quotation_number ?? "Borrador"}
        description={quotation.client_company}
      />
      <Notice success={q.success} error={q.error} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge value={quotation.status} />
        {seller && (
          <span className="text-sm text-[#718078]">
            Vendedor/a: {seller.first_name} {seller.last_name}
          </span>
        )}
      </div>

      {quotation.status === "pending" && (
        <Panel className="mb-5 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            Enviada a aprobación. Se notificó al Gerente de Operaciones.
          </p>
        </Panel>
      )}

      {quotation.status === "rejected" && quotation.resolution_comment && (
        <Panel className="mb-5 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">
            Rechazada por {reviewer?.first_name} {reviewer?.last_name}
          </p>
          <p className="mt-1 text-sm text-red-700">
            {quotation.resolution_comment}
          </p>
        </Panel>
      )}

      {editable ? (
        <>
          <Panel className="mb-5">
            <QuotationForm
              action={updateQuotationAction}
              quotationId={quotation.id}
              submitLabel="Guardar cambios"
              initial={{
                client_company: quotation.client_company,
                client_rut: quotation.client_rut ?? "",
                client_contact: quotation.client_contact ?? "",
                client_email: quotation.client_email ?? "",
                client_place: quotation.client_place ?? "",
                discount: Number(quotation.discount),
                terms: quotation.terms ?? "",
                lines: lines.map((l: any) => ({
                  description: l.description,
                  quantity: Number(l.quantity),
                  unit_price: Number(l.unit_price),
                })),
              }}
            />
          </Panel>
          <Panel>
            <h2 className="mb-2 font-semibold">Enviar a aprobación</h2>
            <p className="mb-3 text-sm text-[#718078]">
              Guarda los cambios primero si acabas de editar. Al enviar, el
              Gerente de Operaciones recibirá una notificación para revisarla.
            </p>
            <form action={submitQuotationAction}>
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
                Enviar a aprobación
              </button>
            </form>
          </Panel>
        </>
      ) : (
        <Panel className="overflow-x-auto">
          <h2 className="mb-3 font-semibold">Datos del cliente</h2>
          <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[#718078]">Rut</dt>
              <dd>{quotation.client_rut ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#718078]">Contacto</dt>
              <dd>{quotation.client_contact ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#718078]">Correo</dt>
              <dd>{quotation.client_email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#718078]">Lugar</dt>
              <dd>{quotation.client_place ?? "—"}</dd>
            </div>
          </dl>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-[#718078]">
                <th className="p-2">Producto</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{l.description}</td>
                  <td className="text-right">{Number(l.quantity)}</td>
                  <td className="text-right">
                    {clp.format(Number(l.unit_price))}
                  </td>
                  <td className="text-right font-semibold">
                    {clp.format(Number(l.line_total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid gap-1 text-sm sm:ml-auto sm:w-72">
            <div className="flex justify-between">
              <span className="text-[#66776d]">Subtotal</span>
              <span>{clp.format(Number(quotation.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#66776d]">Descuento</span>
              <span>{clp.format(Number(quotation.discount))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#66776d]">Neto</span>
              <span>{clp.format(Number(quotation.net))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#66776d]">IVA (19%)</span>
              <span>{clp.format(Number(quotation.iva))}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>Total</span>
              <span>{clp.format(Number(quotation.total))}</span>
            </div>
          </div>
          {quotation.terms && (
            <div className="mt-5 border-t pt-4 text-xs text-[#718078] whitespace-pre-line">
              {quotation.terms}
            </div>
          )}
          {["approved", "delivered"].includes(quotation.status) && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
              <a
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-[var(--oasis-primary)]"
                href={`/api/sales/quotations/${quotation.id}/pdf`}
              >
                Descargar PDF
              </a>
              {quotation.status === "approved" && isOwner && (
                <form action={markDeliveredAction}>
                  <input
                    type="hidden"
                    name="quotation_id"
                    value={quotation.id}
                  />
                  <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
                    Marcar como entregada
                  </button>
                </form>
              )}
              {quotation.status === "delivered" && (
                <span className="text-sm text-[#718078]">
                  Entregada el{" "}
                  {new Date(quotation.delivered_at).toLocaleDateString(
                    "es-CL",
                    { timeZone: "America/Santiago" },
                  )}
                </span>
              )}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
