import Link from "next/link";
import { uiLabel } from "@/lib/ui-labels";
import { Panel } from "@/components/ui/page";
import { StatusBadge } from "./status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export async function PaymentQueue({
  params,
  fixedStatus,
}: {
  params: Record<string, string | undefined>;
  fixedStatus?: string;
}) {
  const ctx = await requirePermission("finance.payments.view"),
    page = Math.max(1, Number(params.page) || 1),
    size = 10,
    s = await createSupabaseServerClient();
  let q = s
    .from("payment_requests")
    .select(
      "id,request_number,approved_at,requester_id,company_id,business_unit_id,supplier_legal_name,supplier_rut,amount,priority,requested_payment_date,status,profiles!payment_requests_requester_id_fkey(first_name,last_name),business_units(name,companies(trade_name)),payments(id,scheduled_date,scheduled_method,method,paid_at,operation_number)",
      { count: "exact" },
    )
    .in(
      "status",
      fixedStatus ? [fixedStatus] : ["approved", "scheduled", "paid"],
    );
  const p: Record<string, string | undefined> = {
    ...params,
    status: fixedStatus ?? params.status,
  };
  if (p.unit) q = q.eq("business_unit_id", p.unit);
  if (p.status) q = q.eq("status", p.status);
  if (p.priority) q = q.eq("priority", p.priority);
  if (p.q)
    q = q.or(
      `request_number.ilike.%${p.q}%,supplier_legal_name.ilike.%${p.q}%,supplier_rut.ilike.%${p.q}%`,
    );
  if (p.min) q = q.gte("amount", Number(p.min));
  if (p.max) q = q.lte("amount", Number(p.max));
  if (p.from) q = q.gte("approved_at", `${p.from}T00:00:00`);
  if (p.to) q = q.lte("approved_at", `${p.to}T23:59:59`);
  const { data, count } = await q
      .order(p.sort === "oldest" ? "approved_at" : "updated_at", {
        ascending: p.sort === "oldest",
      })
      .range((page - 1) * size, page * size - 1),
    pages = Math.max(1, Math.ceil((count ?? 0) / size));
  return (
    <>
      <Panel>
        <form className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Correlativo, proveedor o RUT"
            className="rounded-xl border p-2 text-sm xl:col-span-2"
          />
          <select
            name="unit"
            defaultValue={p.unit}
            className="rounded-xl border p-2 text-sm"
          >
            <option value="">Unidad</option>
            {ctx.units.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {!fixedStatus && (
            <select
              name="status"
              defaultValue={p.status}
              className="rounded-xl border p-2 text-sm"
            >
              <option value="">Estado</option>
              <option value="approved">Aprobada</option>
              <option value="scheduled">Programada</option>
              <option value="paid">Pagada</option>
            </select>
          )}
          <select
            name="priority"
            defaultValue={p.priority}
            className="rounded-xl border p-2 text-sm"
          >
            <option value="">Prioridad</option>
            <option value="urgent">Urgente</option>
            <option value="normal">Normal</option>
            <option value="scheduled">Programado</option>
          </select>
          <input
            name="min"
            type="number"
            placeholder="Monto mín."
            className="rounded-xl border p-2 text-sm"
          />
          <button className="rounded-xl bg-[#083f7d] text-sm text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr>
                <th className="pb-3">Correlativo</th>
                <th>Aprobación</th>
                <th>Solicitante</th>
                <th>Unidad</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Programación</th>
                <th>Medio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => {
                const profile = one(r.profiles),
                  unit = one(r.business_units),
                  payment = one(r.payments);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-4 font-semibold">{r.request_number}</td>
                    <td>
                      {r.approved_at
                        ? new Date(r.approved_at).toLocaleDateString("es-CL")
                        : "—"}
                    </td>
                    <td>
                      {profile?.first_name} {profile?.last_name}
                    </td>
                    <td>{unit?.name}</td>
                    <td>
                      {r.supplier_legal_name}
                      <small className="block">{r.supplier_rut}</small>
                    </td>
                    <td>{money.format(Number(r.amount))}</td>
                    <td>
                      <StatusBadge value={r.priority} />
                    </td>
                    <td>
                      <StatusBadge value={r.status} />
                    </td>
                    <td>
                      {payment?.scheduled_date
                        ? new Date(
                            `${payment.scheduled_date}T12:00:00`,
                          ).toLocaleDateString("es-CL")
                        : "—"}
                    </td>
                    <td>
                      {uiLabel(payment?.method ?? payment?.scheduled_method)}
                    </td>
                    <td>
                      <Link
                        href={`/finance/payment-control/payments/${r.id}`}
                        className="font-semibold text-[#0b4f9c]"
                      >
                        Gestionar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="py-14 text-center text-sm text-slate-500">
            No existen pagos para los filtros seleccionados.
          </p>
        )}
        <div className="mt-4 flex justify-between border-t pt-4 text-sm">
          <span>
            Página {page} de {pages} · {count ?? 0} registros
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ query: { ...params, page: page - 1 } }}
                className="rounded-lg border px-3 py-1"
              >
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link
                href={{ query: { ...params, page: page + 1 } }}
                className="rounded-lg border px-3 py-1"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}
function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined);
}
