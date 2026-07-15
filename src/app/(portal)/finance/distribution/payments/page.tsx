/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { registerPaymentAction } from "@/modules/finance/distribution/application/actions";
import {
  clp,
  distributionContext,
} from "@/modules/finance/distribution/application/queries";
export default async function Payments({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await distributionContext();
  const [{ data: orders }, { data: payments }] = await Promise.all([
    supabase
      .from("dist_orders")
      .select("id,order_number,total,payment_status,dist_customers(name)")
      .eq("business_unit_id", unit.id)
      .in("status", ["delivered", "partially_delivered"])
      .eq("payment_condition", "credit")
      .in("payment_status", ["pending", "partial", "credit", "overdue"])
      .order("delivery_date"),
    supabase
      .from("dist_payments")
      .select(
        "*,dist_customers(name),dist_payment_allocations(amount,dist_orders(order_number))",
      )
      .eq("business_unit_id", unit.id)
      .eq("status", "confirmed")
      .order("paid_at", { ascending: false })
      .limit(100),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Cobros"
        description="Cobro de deuda de clientes a crédito. Los pedidos de contado se pagan automáticamente al entregarse."
      />
      <Flash success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 font-semibold">Registrar cobro</h2>
          <form action={registerPaymentAction} className="space-y-3">
            <label className="block text-sm">
              Pedido
              <select className={inputClass} name="order_id" required>
                {orders?.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.order_number} · {x.dist_customers?.name} ·{" "}
                    {clp.format(Number(x.total))}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Monto
              <input
                className={inputClass}
                name="amount"
                type="number"
                min="1"
                required
              />
            </label>
            <label className="block text-sm">
              Medio
              <select className={inputClass} name="method">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mixed">Mixto</option>
              </select>
            </label>
            <label className="block text-sm">
              Comprobante
              <input className={inputClass} name="receipt" />
            </label>
            <label className="block text-sm">
              Observación
              <textarea className={inputClass} name="notes" />
            </label>
            <button className={buttonClass}>Registrar cobro</button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">Últimos cobros</h2>
          <div className="space-y-2">
            {payments?.map((x: any) => (
              <div
                key={x.id}
                className="flex justify-between rounded-xl border p-3 text-sm"
              >
                <div>
                  <b>{x.dist_customers?.name ?? "Cliente ocasional"}</b>
                  <p className="text-xs text-[#718078]">
                    {new Date(x.paid_at).toLocaleString("es-CL")} · {x.method} ·{" "}
                    {x.receipt_number || "sin comprobante"}
                  </p>
                </div>
                <b>{clp.format(Number(x.amount))}</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
