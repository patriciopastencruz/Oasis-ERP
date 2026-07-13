import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { ExecuteForm } from "@/components/finance/payment-operation-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    ctx = await requirePermission("finance.payments.view"),
    s = await createSupabaseServerClient();
  const { data: r } = await s
    .from("payment_requests")
    .select(
      "*,business_units(name,companies(trade_name)),suppliers(*),profiles!payment_requests_requester_id_fkey(first_name,last_name),payments(*)",
    )
    .eq("id", id)
    .single();
  if (!r) notFound();
  const payment = one(r.payments);
  const [{ data: receipts }, { data: decisions }, { data: audit }] =
    await Promise.all([
      payment
        ? s
            .from("payment_receipts")
            .select("id,original_name,size_bytes,object_path")
            .eq("payment_id", payment.id)
            .is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      s
        .from("payment_request_approval_decisions")
        .select("id,action,comment,created_at")
        .eq("payment_request_id", id)
        .order("created_at"),
      ctx.permissions.has("audit.logs.view")
        ? s
            .from("audit_logs")
            .select("id,action,created_at")
            .in("entity_id", [id, payment?.id].filter(Boolean))
            .order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
  const signed = await Promise.all(
    (receipts ?? []).map(async (x) => ({
      ...x,
      url: (
        await s.storage
          .from("payment-receipts")
          .createSignedUrl(x.object_path, 300)
      ).data?.signedUrl,
    })),
  );
  const unit = one(r.business_units),
    supplier = one(r.suppliers),
    requester = one(r.profiles),
    overdue =
      payment?.scheduled_date &&
      payment.scheduled_date < new Date().toISOString().slice(0, 10) &&
      !payment.paid_at;
  return (
    <>
      <PageHeader
        title={r.request_number}
        description="Registro y trazabilidad del pago."
        eyebrow="Finanzas · Pagos"
      />
      <div className="mb-5 flex justify-between">
        <div className="flex gap-2">
          <StatusBadge value={r.status} />
          {overdue && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
              Vencido
            </span>
          )}
        </div>
        <Link
          href="/finance/payment-control/payments"
          className="font-semibold text-[#277a55]"
        >
          Volver
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-semibold">Solicitud aprobada</h2>
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <I
                l="Solicitante"
                v={`${requester?.first_name ?? ""} ${requester?.last_name ?? ""}`}
              />
              <I l="Unidad" v={unit?.name} />
              <I l="Proveedor" v={supplier?.legal_name} />
              <I l="RUT" v={supplier?.rut} />
              <I l="Monto aprobado" v={money.format(Number(r.amount))} />
              <I
                l="Fecha aprobación"
                v={
                  r.approved_at
                    ? new Date(r.approved_at).toLocaleString("es-CL")
                    : "—"
                }
              />
              <I l="Banco congelado" v={r.bank_name} />
              <I l="Tipo de cuenta" v={r.account_type} />
              <I l="Número de cuenta" v={r.account_number} />
              <I l="Titular" v={r.bank_account_holder_name} />
              <I l="RUT titular" v={r.bank_account_holder_rut} />
              <I l="Correo comprobante" v={r.supplier_email} />
              <I l="Verificación" v={r.bank_verification_status} />
            </dl>
            <p className="mt-5 border-t pt-4 text-sm text-slate-600">
              {r.description}
            </p>
          </Panel>
          {payment && (
            <Panel>
              <h2 className="mb-4 font-semibold">Datos del pago</h2>
              <dl className="grid gap-4 text-sm md:grid-cols-2">
                <I l="Fecha programada" v={payment.scheduled_date} />
                <I l="Medio previsto" v={payment.scheduled_method} />
                <I l="Observación" v={payment.notes} />
                <I
                  l="Fecha real"
                  v={
                    payment.paid_at
                      ? new Date(payment.paid_at).toLocaleString("es-CL")
                      : "Pendiente"
                  }
                />
                <I l="Medio real" v={payment.method} />
                <I l="Operación" v={payment.operation_number} />
                <I
                  l="Monto ejecutado"
                  v={
                    payment.executed_amount
                      ? money.format(Number(payment.executed_amount))
                      : "—"
                  }
                />
                <I l="Observación ejecución" v={payment.execution_notes} />
              </dl>
            </Panel>
          )}
          <Panel>
            <h2 className="mb-4 font-semibold">Comprobantes</h2>
            {signed.length ? (
              signed.map((x) => (
                <a
                  key={x.id}
                  href={x.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex justify-between rounded-xl border p-3 text-sm"
                >
                  <b>{x.original_name}</b>
                  <span>{(x.size_bytes / 1024).toFixed(1)} KB</span>
                </a>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Aún no existe comprobante.
              </p>
            )}
          </Panel>
          {(decisions?.length ?? 0) > 0 && (
            <Panel>
              <h2 className="mb-3 font-semibold">Aprobaciones</h2>
              {decisions?.map((x) => (
                <p key={x.id} className="border-t py-2 text-sm">
                  <b>{x.action}</b> · {x.comment || "Sin comentario"}
                </p>
              ))}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          {["approved", "scheduled"].includes(r.status) &&
            ctx.permissions.has("finance.payments.execute") && (
              <Panel>
                <ExecuteForm
                  requestId={id}
                  companyId={r.company_id}
                  amount={Number(r.amount)}
                />
              </Panel>
            )}
          <Panel>
            <h2 className="mb-4 font-semibold">Progreso</h2>
            {["approved", "paid"].map((x, i) => {
              const current = r.status === "paid" ? 1 : 0;
              return (
                <div key={x} className="flex gap-3 pb-5">
                  <span
                    className={`mt-1 size-4 rounded-full ${i <= current ? "bg-[#277a55]" : "bg-slate-200"}`}
                  />
                  <StatusBadge value={x} />
                </div>
              );
            })}
          </Panel>
          {audit && audit.length > 0 && (
            <Panel>
              <h2 className="mb-3 font-semibold">Auditoría</h2>
              {audit.map((x) => (
                <p key={x.id} className="border-t py-2 text-xs">
                  {x.action} · {new Date(x.created_at).toLocaleString("es-CL")}
                </p>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
function I({ l, v }: { l: string; v: unknown }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{l}</dt>
      <dd className="mt-1 font-medium">{String(v ?? "—")}</dd>
    </div>
  );
}
