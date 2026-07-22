/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import {
  ReceiptText,
  WalletCards,
  ClipboardCheck,
  Boxes,
  Route,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { approvableSteps } from "@/modules/finance/payment-control/application/approval-queries";
import { reviewQuotationAction } from "@/modules/sales/quotations/application/actions";
import { decideMaterialChangeAction } from "@/modules/inventory/application/actions";
import { reviewOrderChangeAction } from "@/modules/finance/distribution/application/actions";
import { InlineDecisionForm } from "@/components/administration/inline-decision-form";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("es-CL") : "—";
const one = (value: any) => (Array.isArray(value) ? value[0] : value);

function Notice({ success, error }: { success?: string; error?: string }) {
  const message = success || error;
  if (!message) return null;
  return (
    <p
      className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
    >
      {message}
    </p>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: any;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} className="text-[var(--oasis-primary,#173f2d)]" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {count}
        </span>
      </div>
      {count > 0 ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <Panel>
          <p className="text-sm text-[#718078]">
            No hay pendientes en este módulo.
          </p>
        </Panel>
      )}
    </section>
  );
}

export default async function AdministrationApprovals({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const p = await searchParams;
  const ctx = await requirePermission("administration.approvals.view");
  const s = await createSupabaseServerClient();

  const [quotationsRes, paymentSteps, pettyCashRes, inventoryRes, distRes] =
    await Promise.all([
      ctx.permissions.has("sales.quotations.approve")
        ? s
            .from("om_quotations")
            .select(
              "id,quotation_number,client_company,total,submitted_at,business_units(name),seller:profiles!om_quotations_created_by_fkey(first_name,last_name)",
            )
            .eq("status", "pending")
            .is("deleted_at", null)
            .order("submitted_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      ctx.permissions.has("finance.approvals.decide")
        ? approvableSteps()
        : Promise.resolve([] as any[]),
      ctx.permissions.has("finance.petty_cash.review")
        ? s
            .from("petty_cash_reports")
            .select(
              "id,report_number,total_registered,submitted_at,business_units(name),profiles!petty_cash_reports_responsible_id_fkey(first_name,last_name)",
            )
            .in("status", ["submitted", "resubmitted", "under_review"])
            .is("deleted_at", null)
            .order("submitted_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      ctx.permissions.has("inventory.approvals.decide")
        ? s
            .from("inventory_change_requests")
            .select(
              "id,request_type,reason,requested_at,business_units(name),inventory_materials(code,name),profiles!inventory_change_requests_requested_by_fkey(first_name,last_name)",
            )
            .eq("status", "pending")
            .order("requested_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      ctx.permissions.has("finance.distribution.requests.review")
        ? s
            .from("dist_change_requests")
            .select(
              "id,type,reason,created_at,business_units(name),dist_orders(order_number,dist_customers(name),occasional_customer_name)",
            )
            .in("status", ["pending", "in_review"])
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const quotations = quotationsRes.data ?? [];
  const pettyCash = pettyCashRes.data ?? [];
  const inventoryRequests = inventoryRes.data ?? [];
  const distRequests = distRes.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administración General"
        title="Bandeja de aprobaciones"
        description="Todas las aprobaciones pendientes de tus unidades, en un solo lugar."
      />
      <Notice success={p.success} error={p.error} />

      {ctx.permissions.has("sales.quotations.approve") && (
        <Section
          icon={ReceiptText}
          title="Cotizaciones"
          count={quotations.length}
        >
          {quotations.map((x) => {
            const unit = one(x.business_units);
            const seller = one(x.seller);
            return (
              <Panel key={x.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-[#718078]">
                      {x.quotation_number} · {unit?.name}
                    </p>
                    <h3 className="font-semibold">{x.client_company}</h3>
                    <p className="text-sm text-[#718078]">
                      Vendedor/a: {seller?.first_name} {seller?.last_name}
                    </p>
                    <p className="mt-1 font-bold text-[var(--oasis-primary,#173f2d)]">
                      {money.format(Number(x.total))}
                    </p>
                    <Link
                      href={`/sales/quotations/${x.id}`}
                      className="mt-2 inline-block text-sm font-semibold text-[var(--oasis-primary,#173f2d)] underline"
                    >
                      Ver detalle completo
                    </Link>
                  </div>
                  <InlineDecisionForm
                    action={reviewQuotationAction}
                    hiddenFields={{ quotation_id: x.id }}
                    commentName="comment"
                    commentRequired
                    commentPlaceholder="Comentario de resolución"
                  />
                </div>
              </Panel>
            );
          })}
        </Section>
      )}

      {ctx.permissions.has("finance.approvals.decide") && (
        <Section
          icon={WalletCards}
          title="Solicitud de Pagos"
          count={paymentSteps.length}
        >
          {paymentSteps.map((x: any) => {
            const r = one(x.payment_requests);
            const profile = one(r?.profiles);
            const unit = one(r?.business_units);
            return (
              <Panel key={x.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-[#718078]">
                      {r?.request_number} · {unit?.name}
                    </p>
                    <h3 className="font-semibold">{r?.supplier_legal_name}</h3>
                    <p className="text-sm text-[#718078]">
                      Solicita: {profile?.first_name} {profile?.last_name} ·
                      Etapa: {x.step_name_snapshot}
                    </p>
                    <p className="mt-1 font-bold text-[var(--oasis-primary,#173f2d)]">
                      {money.format(Number(r?.amount))}
                    </p>
                  </div>
                  <Link
                    href={`/finance/payment-control/approvals/${r?.id}`}
                    className="h-fit rounded-lg bg-[#173f2d] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Revisar
                  </Link>
                </div>
              </Panel>
            );
          })}
        </Section>
      )}

      {ctx.permissions.has("finance.petty_cash.review") && (
        <Section
          icon={ClipboardCheck}
          title="Caja Chica"
          count={pettyCash.length}
        >
          {pettyCash.map((x) => {
            const unit = one(x.business_units);
            const profile = one(x.profiles);
            return (
              <Panel key={x.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-[#718078]">
                      {x.report_number} · {unit?.name}
                    </p>
                    <h3 className="font-semibold">
                      {profile?.first_name} {profile?.last_name}
                    </h3>
                    <p className="mt-1 font-bold text-[var(--oasis-primary,#173f2d)]">
                      {money.format(Number(x.total_registered))}
                    </p>
                    <p className="text-sm text-[#718078]">
                      Enviada: {dateLabel(x.submitted_at)}
                    </p>
                  </div>
                  <Link
                    href={`/finance/petty-cash/reviews/${x.id}`}
                    className="h-fit rounded-lg bg-[#173f2d] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Revisar
                  </Link>
                </div>
              </Panel>
            );
          })}
        </Section>
      )}

      {ctx.permissions.has("inventory.approvals.decide") && (
        <Section
          icon={Boxes}
          title="Inventario"
          count={inventoryRequests.length}
        >
          {inventoryRequests.map((x) => {
            const material = one(x.inventory_materials);
            const profile = one(x.profiles);
            const unit = one(x.business_units);
            return (
              <Panel key={x.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-[#718078]">
                      {x.request_type === "edit" ? "Edición" : "Desactivación"}{" "}
                      · {unit?.name}
                    </p>
                    <h3 className="font-semibold">
                      {material?.code} · {material?.name}
                    </h3>
                    <p className="text-sm text-[#718078]">
                      Solicita: {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="mt-1 text-sm">
                      <b>Motivo:</b> {x.reason}
                    </p>
                  </div>
                  <InlineDecisionForm
                    action={decideMaterialChangeAction}
                    hiddenFields={{ request_id: x.id }}
                    commentName="note"
                    commentPlaceholder="Observación opcional"
                  />
                </div>
              </Panel>
            );
          })}
        </Section>
      )}

      {ctx.permissions.has("finance.distribution.requests.review") && (
        <Section icon={Route} title="Distribuidora" count={distRequests.length}>
          {distRequests.map((x) => {
            const order = one(x.dist_orders);
            const customer = one(order?.dist_customers);
            const unit = one(x.business_units);
            return (
              <Panel key={x.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-[#718078]">
                      {x.type === "edit" ? "Edición" : "Anulación"} ·{" "}
                      {unit?.name}
                    </p>
                    <h3 className="font-semibold">
                      Pedido {order?.order_number}
                    </h3>
                    <p className="text-sm text-[#718078]">
                      {customer?.name ?? order?.occasional_customer_name}
                    </p>
                    <p className="mt-1 text-sm">
                      <b>Motivo:</b> {x.reason}
                    </p>
                  </div>
                  <InlineDecisionForm
                    action={reviewOrderChangeAction}
                    hiddenFields={{ request_id: x.id }}
                    commentName="comment"
                    commentRequired
                    commentPlaceholder="Comentario de resolución"
                  />
                </div>
              </Panel>
            );
          })}
        </Section>
      )}
    </>
  );
}
