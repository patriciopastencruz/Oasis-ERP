import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { StatusBadge } from "@/components/finance/status-badge";
import { ApprovalDecisionForm } from "@/components/finance/approval-decision-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function ApprovalDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("finance.approvals.decide");
  const s = await createSupabaseServerClient();
  const { data: r } = await s
    .from("payment_requests")
    .select(
      "*,business_units(name,companies(trade_name)),suppliers(legal_name,rut),expense_categories(name),cost_centers(name),profiles!payment_requests_requester_id_fkey(first_name,last_name)",
    )
    .eq("id", id)
    .single();
  if (!r) notFound();
  const [
    { data: instances },
    { data: attachments },
    { data: decisions },
    { data: audit },
  ] = await Promise.all([
    s
      .from("payment_request_approval_instances")
      .select(
        "*,payment_request_approval_steps(*,roles!payment_request_approval_steps_required_role_id_fkey(name))",
      )
      .eq("payment_request_id", id)
      .order("revision"),
    s
      .from("payment_request_attachments")
      .select("id,original_name,size_bytes,object_path,created_at")
      .eq("payment_request_id", id)
      .is("deleted_at", null),
    s
      .from("payment_request_approval_decisions")
      .select(
        "*,profiles!payment_request_approval_decisions_approver_id_fkey(first_name,last_name),roles!payment_request_approval_decisions_actual_role_id_fkey(name)",
      )
      .eq("payment_request_id", id)
      .order("created_at"),
    ctx.permissions.has("audit.logs.view")
      ? s
          .from("audit_logs")
          .select("id,action,entity_type,created_at")
          .eq("entity_id", id)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const signed = await Promise.all(
    (attachments ?? []).map(async (a) => ({
      ...a,
      url: (
        await s.storage
          .from("payment-request-attachments")
          .createSignedUrl(a.object_path, 300)
      ).data?.signedUrl,
    })),
  );
  const current = instances?.find((x) => x.id === r.approval_instance_id);
  const steps = (current?.payment_request_approval_steps ?? []).sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Number(a.sequence_order) - Number(b.sequence_order),
  );
  const checks = await Promise.all(
    steps
      .filter((x: Record<string, unknown>) => x.status === "pending")
      .map(async (x: Record<string, unknown>) => ({
        step: x,
        ok:
          (await s.rpc("can_approve_workflow_step", { target_step: x.id }))
            .data === true,
      })),
  );
  const actionable = checks.find((x) => x.ok)?.step;
  const unit = one(r.business_units),
    supplier = one(r.suppliers),
    category = one(r.expense_categories),
    center = one(r.cost_centers),
    requester = one(r.profiles);
  return (
    <>
      <PageHeader
        title={r.request_number ?? "Solicitud"}
        description="Revisión de antecedentes y flujo de aprobación registrado."
        eyebrow="Bandeja de aprobaciones"
      />
      <div className="mb-5 flex justify-between">
        <div className="flex gap-2">
          <StatusBadge value={r.status} />
          <StatusBadge value={r.priority} />
        </div>
        <Link
          href="/finance/payment-control/approvals"
          className="font-semibold text-[#277a55]"
        >
          Volver a la bandeja
        </Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-semibold">Solicitud</h2>
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
            </dl>
            <div className="mt-5 border-t pt-4">
              <b className="text-sm">Descripción</b>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                {r.description}
              </p>
              {r.notes && (
                <p className="mt-3 text-sm text-slate-600">{r.notes}</p>
              )}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 font-semibold">Datos bancarios para el pago</h2>
            {r.use_supplier_bank_account ? (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  Cuenta del proveedor congelada para esta solicitud
                </p>
                <dl className="grid gap-4 text-sm md:grid-cols-2">
                  <Info label="Banco" value={r.bank_name} />
                  <Info
                    label="Tipo de cuenta"
                    value={uiLabel(r.account_type)}
                  />
                  <Info label="Número de cuenta" value={r.account_number} />
                  <Info label="Titular" value={r.bank_account_holder_name} />
                  <Info label="RUT titular" value={r.bank_account_holder_rut} />
                  <Info label="Correo comprobante" value={r.supplier_email} />
                </dl>
              </>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                El solicitante indicó que el pago no utilizará la cuenta
                bancaria del proveedor.
              </p>
            )}
          </Panel>
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
                    className="flex justify-between rounded-xl border p-3 text-sm"
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
              {decisions?.map((d) => {
                const person = one(d.profiles),
                  role = one(d.roles);
                return (
                  <div
                    key={d.id}
                    className="border-l-2 border-[#91baa5] pb-5 pl-4 text-sm"
                  >
                    <div className="flex gap-2">
                      <StatusBadge value={d.action} />
                      {d.acted_as_substitute && (
                        <span className="rounded-full bg-purple-100 px-2 py-1 text-xs">
                          Sustitución
                        </span>
                      )}
                    </div>
                    <b className="mt-2 block">
                      {person?.first_name} {person?.last_name} · {role?.name}
                    </b>
                    <p>{d.comment || "Sin comentario"}</p>
                    <small>
                      {new Date(d.created_at).toLocaleString("es-CL")}
                    </small>
                  </div>
                );
              })}
            </Panel>
          )}
        </div>
        <div className="space-y-5">
          {actionable && (
            <ApprovalDecisionForm
              step={actionable}
              requestId={id}
              companyId={r.company_id}
            />
          )}
          <Panel>
            <h2 className="mb-2 font-semibold">
              Flujo de aprobación registrado
            </h2>
            <p className="text-sm">
              {current?.workflow_name_snapshot ?? "Sin instancia"}
            </p>
            <p className="text-xs text-slate-500">
              Revisión {current?.revision ?? "—"} ·{" "}
              {uiLabel(current?.correction_policy)}
            </p>
            <div className="mt-4 space-y-3">
              {steps.map((x: Record<string, unknown>) => {
                const role = one(
                  x.roles as { name?: string } | { name?: string }[] | null,
                );
                return (
                  <div
                    key={String(x.id)}
                    className={`rounded-xl border p-3 text-sm ${x.id === actionable?.id ? "border-[#277a55] bg-[#f2faf5]" : ""}`}
                  >
                    <div className="flex justify-between">
                      <b>{String(x.step_name_snapshot)}</b>
                      <StatusBadge value={String(x.status)} />
                    </div>
                    <small>
                      Orden {String(x.sequence_order)} · {role?.name}
                      {x.execution_mode === "parallel" ? " · Paralela" : ""}
                    </small>
                  </div>
                );
              })}
            </div>
          </Panel>
          {(instances?.length ?? 0) > 1 && (
            <Panel>
              <h2 className="mb-3 font-semibold">Historial de revisiones</h2>
              {instances?.map((x) => (
                <div
                  key={x.id}
                  className="flex justify-between border-t py-2 text-sm"
                >
                  <span>Revisión {x.revision}</span>
                  <StatusBadge value={x.status} />
                </div>
              ))}
            </Panel>
          )}
          {audit && audit.length > 0 && (
            <Panel>
              <h2 className="mb-3 font-semibold">Auditoría</h2>
              {audit.map((x) => (
                <p key={x.id} className="border-t py-2 text-xs">
                  {uiLabel(x.action)} ·{" "}
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
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium">{String(value ?? "—")}</dd>
    </div>
  );
}
