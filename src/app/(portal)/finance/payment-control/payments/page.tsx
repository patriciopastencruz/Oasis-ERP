import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { PaymentQueue } from "@/components/finance/payment-queue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function Payments({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("finance.payments.view");
  const s = await createSupabaseServerClient(),
    today = new Date().toISOString().slice(0, 10),
    month = `${today.slice(0, 7)}-01`;
  const [{ data: requests }, { data: payments }] = await Promise.all([
    s
      .from("payment_requests")
      .select("amount,status")
      .in("status", ["approved", "scheduled"]),
    s
      .from("payments")
      .select(
        "scheduled_date,paid_at,executed_amount,payment_requests(amount)",
      ),
  ]);
  const approved = (requests ?? []).filter((x) => x.status === "approved"),
    scheduled = (requests ?? []).filter((x) => x.status === "scheduled"),
    paidToday = (payments ?? []).filter(
      (x) => x.paid_at?.slice(0, 10) === today,
    ),
    paidMonth = (payments ?? []).filter(
      (x) => x.paid_at && x.paid_at.slice(0, 10) >= month,
    ),
    week = new Date();
  week.setDate(week.getDate() + 7);
  const weekEnd = week.toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Pagos"
        description="Registro y seguimiento de pagos aprobados."
        eyebrow="Finanzas · Gestión de Pagos"
      />
      <div className="mb-5 flex gap-3">
        <Link
          href="/finance/payment-control/payments/paid"
          className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold"
        >
          Pagados
        </Link>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <K label="Pendientes de pago" value={approved.length} />
        <K
          label="Programados hoy"
          value={
            (payments ?? []).filter(
              (x) => x.scheduled_date === today && !x.paid_at,
            ).length
          }
        />
        <K
          label="Programados esta semana"
          value={
            (payments ?? []).filter(
              (x) =>
                x.scheduled_date >= today &&
                x.scheduled_date <= weekEnd &&
                !x.paid_at,
            ).length
          }
        />
        <K
          label="Vencidos"
          value={
            (payments ?? []).filter(
              (x) => x.scheduled_date < today && !x.paid_at,
            ).length
          }
        />
        <K label="Pagados hoy" value={paidToday.length} />
        <K label="Pagados este mes" value={paidMonth.length} />
        <K
          label="Monto pendiente"
          value={money.format(
            approved.reduce((a, x) => a + Number(x.amount), 0),
          )}
        />
        <K
          label="Monto programado"
          value={money.format(
            scheduled.reduce((a, x) => a + Number(x.amount), 0),
          )}
        />
      </div>
      <PaymentQueue params={await searchParams} />
    </>
  );
}
function K({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <b className="mt-2 block text-xl">{value}</b>
    </div>
  );
}
