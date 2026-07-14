import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function Page() {
  await requirePermission("finance.reports.view");
  const s = await createSupabaseServerClient();
  const [{ data: r }, { data: p }, { data: d }] = await Promise.all([
    s
      .from("payment_requests")
      .select(
        "amount,status,priority,created_at,submitted_at,approved_at,company_id,business_unit_id,supplier_legal_name,business_units(name,companies(trade_name)),expense_categories(name)",
      )
      .is("deleted_at", null),
    s
      .from("payments")
      .select(
        "scheduled_date,paid_at,executed_amount,payment_requests(amount,approved_at)",
      ),
    s.from("payment_request_approval_decisions").select("action"),
  ]);
  const requests = r ?? [],
    payments = p ?? [],
    decisions = d ?? [],
    sum = (xs: typeof requests) => xs.reduce((a, x) => a + Number(x.amount), 0),
    today = new Date().toISOString().slice(0, 10),
    month = today.slice(0, 7),
    approvalHours = requests
      .filter((x) => x.submitted_at && x.approved_at)
      .map(
        (x) =>
          (new Date(x.approved_at).getTime() -
            new Date(x.submitted_at).getTime()) /
          36e5,
      ),
    paymentHours = payments
      .filter((x) => x.paid_at)
      .map((x) => {
        const pr = one(x.payment_requests);
        return pr?.approved_at
          ? (new Date(x.paid_at).getTime() -
              new Date(pr.approved_at).getTime()) /
              36e5
          : 0;
      })
      .filter(Boolean),
    approved = decisions.filter((x) => x.action === "approve").length,
    rejected = decisions.filter((x) => x.action === "reject").length;
  const states = group(
      requests,
      (x) => x.status,
      (x) => Number(x.amount),
    ),
    units = group(
      requests,
      (x) => one(x.business_units)?.name ?? "—",
      (x) => Number(x.amount),
    ),
    categories = group(
      requests,
      (x) => one(x.expense_categories)?.name ?? "—",
      (x) => Number(x.amount),
    ),
    providers = group(
      requests,
      (x) => x.supplier_legal_name,
      (x) => Number(x.amount),
    );
  return (
    <>
      <PageHeader
        title="Dashboard financiero"
        description="Indicadores consolidados con el alcance autorizado por RLS."
        eyebrow="Finanzas · Solicitud de Pagos"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <K l="Solicitado" v={money.format(sum(requests))} />
        <K
          l="Aprobado pendiente"
          v={money.format(sum(requests.filter((x) => x.status === "approved")))}
        />
        <K
          l="Programado"
          v={money.format(
            sum(requests.filter((x) => x.status === "scheduled")),
          )}
        />
        <K
          l="Pagado del mes"
          v={money.format(
            payments
              .filter((x) => x.paid_at?.startsWith(month))
              .reduce((a, x) => a + Number(x.executed_amount ?? 0), 0),
          )}
        />
        <K
          l="Vencidos"
          v={
            payments.filter((x) => x.scheduled_date < today && !x.paid_at)
              .length
          }
        />
        <K
          l="Pendientes aprobación"
          v={
            requests.filter((x) =>
              ["pending_approval", "under_review"].includes(x.status),
            ).length
          }
        />
        <K
          l="Urgentes"
          v={
            requests.filter(
              (x) =>
                x.priority === "urgent" &&
                !["paid", "rejected", "cancelled"].includes(x.status),
            ).length
          }
        />
        <K l="Tiempo aprobación" v={avg(approvalHours)} />
        <K l="Tiempo de pago" v={avg(paymentHours)} />
        <K
          l="Tasa aprobación"
          v={`${approved + rejected ? Math.round((100 * approved) / (approved + rejected)) : 0}%`}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Chart title="Estados" data={states} />
        <Chart title="Gasto por unidad" data={units} />
        <Chart title="Gasto por categoría" data={categories} />
        <Chart title="Gasto por proveedor" data={providers} />
      </div>
    </>
  );
}
function K({ l, v }: { l: string; v: string | number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs uppercase text-slate-500">{l}</p>
      <b className="mt-2 block text-xl">{v}</b>
    </div>
  );
}
function Chart({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map((x) => x[1]), 1);
  return (
    <Panel>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {data.slice(0, 8).map(([k, v]) => (
        <div key={k} className="mb-3 text-sm">
          <div className="flex justify-between">
            <span>{k}</span>
            <b>{money.format(v)}</b>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100">
            <div
              className="h-2 rounded bg-[#277a55]"
              style={{ width: `${(100 * v) / max}%` }}
            />
          </div>
        </div>
      ))}
    </Panel>
  );
}
function group<T>(xs: T[], key: (x: T) => string, value: (x: T) => number) {
  return Object.entries(
    xs.reduce<Record<string, number>>(
      (a, x) => ((a[key(x)] = (a[key(x)] || 0) + value(x)), a),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
}
function avg(xs: number[]) {
  return xs.length
    ? `${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} h`
    : "—";
}
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
