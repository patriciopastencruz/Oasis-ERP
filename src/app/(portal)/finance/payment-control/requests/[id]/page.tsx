import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import {
  DeleteAttachment,
  SubmitRequest,
} from "@/components/finance/request-actions";
import { PaymentRequestForm } from "@/components/finance/payment-request-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function RequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireSession();
  const s = await createSupabaseServerClient();
  const { data: r, error: requestError } = await s
    .from("payment_requests")
    .select(
      "*,business_units(name,companies(trade_name)),suppliers(legal_name,rut),expense_categories(name),cost_centers(name),profiles!payment_requests_requester_id_fkey(first_name,last_name)",
    )
    .eq("id", id)
    .single();
  if (requestError && requestError.code !== "PGRST116") {
    console.error("[payment-request-detail]", requestError.message);
    throw new Error("No fue posible cargar el detalle de la solicitud.");
  }
  if (!r) notFound();
  // La solicitud ya fue autorizada por RLS. La lectura privilegiada evita que
  // la política financiera de payments oculte al solicitante su comprobante.
  const admin = createSupabaseAdminClient();
  const editable =
    r.requester_id === ctx.user.id &&
    ["draft", "correction_requested"].includes(r.status);
  const [
    { data: attachments },
    { data: receipts },
    { data: instance },
    { data: decisions },
    { data: audit },
  ] = await Promise.all([
    s
      .from("payment_request_attachments")
      .select("id,original_name,mime_type,size_bytes,object_path,created_at")
      .eq("payment_request_id", id)
      .is("deleted_at", null)
      .order("created_at"),
    admin
      .from("payment_receipts")
      .select(
        "id,original_name,mime_type,size_bytes,object_path,created_at,payments!inner(payment_request_id,paid_at,operation_number)",
      )
      .eq("payments.payment_request_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    r.approval_instance_id
      ? s
          .from("payment_request_approval_instances")
          .select(
            "*,payment_request_approval_steps(*,roles!payment_request_approval_steps_required_role_id_fkey(name))",
          )
          .eq("id", r.approval_instance_id)
          .single()
      : Promise.resolve({ data: null }),
    s
      .from("payment_request_approval_decisions")
      .select(
        "*,profiles!payment_request_approval_decisions_approver_id_fkey(first_name,last_name)",
      )
      .eq("payment_request_id", id)
      .order("created_at"),
    ctx.permissions.has("audit.logs.view")
      ? s
          .from("audit_logs")
          .select("id,action,created_at,actor_id")
          .eq("entity_type", "payment_requests")
          .eq("entity_id", id)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const signed = await Promise.all(
    (attachments ?? []).map(async (a) => {
      const { data } = await s.storage
        .from("payment-request-attachments")
        .createSignedUrl(a.object_path, 300);
      return { ...a, url: data?.signedUrl };
    }),
  );
  const signedReceipts = await Promise.all(
    (receipts ?? []).map(async (receipt) => {
      const { data } = await admin.storage
        .from("payment-receipts")
        .createSignedUrl(receipt.object_path, 300, {
          download: receipt.original_name,
        });
      return { ...receipt, url: data?.signedUrl };
    }),
  );
  if (editable) {
    const companyIds = ctx.companies.map((x) => x.id);
    const [{ data: suppliers }, { data: categories }, { data: centers }] =
      await Promise.all([
        s
          .from("suppliers")
          .select("id,company_id,rut,legal_name")
          .in("company_id", companyIds)
          .eq("active", true),
        s
          .from("expense_categories")
          .select("id,company_id,business_unit_id,name")
          .in("company_id", companyIds)
          .eq("active", true),
        s
          .from("cost_centers")
          .select("id,company_id,business_unit_id,name")
          .in("company_id", companyIds)
          .eq("active", true),
      ]);
    return (
      <>
        <PageHeader
          title={r.request_number ?? "Editar borrador"}
          description="Actualiza los datos, administra respaldos y envía cuando esté completo."
          eyebrow="Finanzas · Gestión de Pagos"
        />
        <div className="mb-5 flex items-center justify-between">
          <StatusBadge value={r.status} />
          <Link
            href="/finance/payment-control/my-requests"
            className="text-sm font-semibold text-[#277a55]"
          >
            Volver a mis solicitudes
          </Link>
        </div>
        {signed.length > 0 && (
          <Panel className="mb-5">
            <h2 className="mb-3 font-semibold">Respaldos actuales</h2>
            <div className="space-y-2">
              {signed.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between rounded-xl border p-3 text-sm"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#277a55]"
                  >
                    {a.original_name}
                  </a>
                  <DeleteAttachment id={a.id} />
                </div>
              ))}
            </div>
          </Panel>
        )}
        <PaymentRequestForm
          request={r}
          companies={ctx.companies.map((x) => ({
            id: x.id,
            name: x.trade_name,
          }))}
          units={ctx.units}
          suppliers={suppliers ?? []}
          categories={categories ?? []}
          centers={centers ?? []}
        />
        <div className="mt-5">
          <SubmitRequest id={id} />
        </div>
      </>
    );
  }
  const unit = Array.isArray(r.business_units)
    ? r.business_units[0]
    : r.business_units;
  const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers;
  const category = Array.isArray(r.expense_categories)
    ? r.expense_categories[0]
    : r.expense_categories;
  const center = Array.isArray(r.cost_centers)
    ? r.cost_centers[0]
    : r.cost_centers;
  const requester = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  const steps = (instance?.payment_request_approval_steps ?? []).sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Number(a.sequence_order) - Number(b.sequence_order),
  );
  return (
    <>
      <PageHeader
        title={r.request_number ?? "Solicitud"}
        description="Detalle y seguimiento completo de la solicitud."
        eyebrow="Finanzas · Gestión de Pagos"
      />
      <div className="mb-5 flex items-center justify-between">
        <StatusBadge value={r.status} />
        <Link
          href="/finance/payment-control/my-requests"
          className="text-sm font-semibold text-[#277a55]"
        >
          Volver
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-semibold">Información general</h2>
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <Info
                label="Solicitante"
                value={`${requester?.first_name ?? ""} ${requester?.last_name ?? ""}`}
              />
              <Info label="Unidad" value={unit?.name} />
              <Info label="Proveedor" value={supplier?.legal_name} />
              <Info label="RUT" value={supplier?.rut} />
              <Info label="Monto" value={money.format(Number(r.amount))} />
              <Info label="Categoría" value={category?.name} />
              <Info label="Centro de costo" value={center?.name} />
              <Info label="Prioridad" value={r.priority} />
              <Info
                label="Fecha solicitada"
                value={
                  r.requested_payment_date
                    ? new Date(
                        `${r.requested_payment_date}T12:00:00`,
                      ).toLocaleDateString("es-CL")
                    : "Sin fecha"
                }
              />
            </dl>
            <div className="mt-5 border-t pt-4 text-sm">
              <b>Descripción</b>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">
                {r.description}
              </p>
              {r.notes && (
                <>
                  <b className="mt-4 block">Observaciones</b>
                  <p className="mt-2 whitespace-pre-wrap text-slate-600">
                    {r.notes}
                  </p>
                </>
              )}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-semibold">Datos bancarios para el pago</h2>
            <p className="mb-3 text-xs text-slate-500">
              Cuenta del proveedor congelada al enviar la solicitud
            </p>
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <Info label="Banco" value={r.bank_name} />
              <Info label="Tipo de cuenta" value={r.account_type} />
              <Info label="Número de cuenta" value={r.account_number} />
              <Info label="Titular" value={r.bank_account_holder_name} />
              <Info label="RUT titular" value={r.bank_account_holder_rut} />
              <Info label="Correo comprobante" value={r.supplier_email} />
            </dl>
          </Panel>
          {!editable &&
            ["approved", "scheduled", "paid"].includes(r.status) && (
              <Panel>
                <h2 className="mb-2 font-semibold">Comprobante de pago</h2>
                {signedReceipts.length > 0 ? (
                  <>
                    <p className="mb-4 text-sm text-slate-500">
                      Descarga el comprobante para guardarlo o enviarlo al
                      proveedor.
                    </p>
                    <div className="space-y-2">
                      {signedReceipts.map((receipt) => (
                        <a
                          key={receipt.id}
                          href={receipt.url}
                          download={receipt.original_name}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm hover:bg-slate-50"
                        >
                          <span>
                            <b>{receipt.original_name}</b>
                            <small className="mt-1 block text-slate-500">
                              {(receipt.size_bytes / 1024).toFixed(1)} KB
                            </small>
                          </span>
                          <span className="font-semibold text-[#277a55]">
                            Descargar
                          </span>
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    {r.status === "paid"
                      ? "El pago figura como realizado, pero no tiene un comprobante disponible. Contacta a Finanzas."
                      : "La solicitud está aprobada, pero el pago y su comprobante aún no han sido registrados por Finanzas."}
                  </p>
                )}
              </Panel>
            )}
          <Panel>
            <h2 className="mb-4 font-semibold">Respaldos</h2>
            {signed.length ? (
              <div className="space-y-2">
                {signed.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex justify-between rounded-xl border p-3 text-sm hover:bg-slate-50"
                  >
                    <b>{a.original_name}</b>
                    <span>{(a.size_bytes / 1024).toFixed(1)} KB</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sin respaldos visibles.</p>
            )}
          </Panel>
          {(decisions?.length ?? 0) > 0 && (
            <Panel>
              <h2 className="mb-4 font-semibold">Historial de decisiones</h2>
              {decisions?.map((d) => (
                <div
                  key={d.id}
                  className="border-l-2 border-[#91baa5] pb-4 pl-4 text-sm"
                >
                  <b>{d.action}</b>
                  <p>{d.comment || "Sin comentario"}</p>
                  <small>
                    {new Date(d.created_at).toLocaleString("es-CL")}
                  </small>
                </div>
              ))}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-semibold">Progreso</h2>
            <Timeline status={r.status} />
          </Panel>
          <Panel>
            <h2 className="mb-4 font-semibold">Workflow</h2>
            {instance ? (
              <>
                <b className="text-sm">{instance.workflow_name_snapshot}</b>
                <p className="text-xs text-slate-500">
                  {instance.workflow_code_snapshot} · Revisión{" "}
                  {instance.revision}
                </p>
                <div className="mt-4 space-y-3">
                  {steps.map((step: Record<string, unknown>) => {
                    const role = Array.isArray(step.roles)
                      ? step.roles[0]
                      : (step.roles as { name?: string } | null);
                    return (
                      <div
                        key={String(step.id)}
                        className="rounded-xl border p-3 text-sm"
                      >
                        <div className="flex justify-between gap-2">
                          <b>{String(step.step_name_snapshot)}</b>
                          <StatusBadge value={String(step.status)} />
                        </div>
                        <small>
                          {role?.name} · Orden {String(step.sequence_order)}
                          {step.execution_mode === "parallel"
                            ? " · Paralela"
                            : ""}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                El workflow se asignará al enviar.
              </p>
            )}
          </Panel>
          {audit && audit.length > 0 && (
            <Panel>
              <h2 className="mb-3 font-semibold">Auditoría</h2>
              {audit.map((x) => (
                <p key={x.id} className="border-t py-2 text-xs">
                  <b>{x.action}</b> ·{" "}
                  {new Date(x.created_at).toLocaleString("es-CL")}
                </p>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium">{String(value ?? "—")}</dd>
    </div>
  );
}
function Timeline({ status }: { status: string }) {
  const main = ["draft", "pending_approval", "approved", "scheduled", "paid"];
  const current = main.indexOf(status);
  const alternate: { [k: string]: string } = {
    correction_requested: "Corrección solicitada",
    rejected: "Rechazada",
    cancelled: "Anulada",
  };
  return (
    <div>
      {main.map((x, i) => (
        <div key={x} className="flex gap-3 pb-4 last:pb-0">
          <span
            className={`mt-0.5 size-4 rounded-full border-4 ${i <= current ? "border-[#277a55] bg-[#277a55]" : "border-slate-200"}`}
          />
          <div>
            <StatusBadge value={x} />
            {x === "pending_approval" && status === "under_review" && (
              <span className="ml-2 text-xs">En revisión</span>
            )}
          </div>
        </div>
      ))}
      {alternate[status] && (
        <div className="mt-2 border-t pt-3">
          <StatusBadge value={status} />
        </div>
      )}
    </div>
  );
}
