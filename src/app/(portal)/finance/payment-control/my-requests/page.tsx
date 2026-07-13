import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export default async function MyRequests({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSession();
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1);
  const size = 10;
  const s = await createSupabaseServerClient();
  let q = s
    .from("payment_requests")
    .select(
      "id,request_number,created_at,updated_at,amount,priority,status,requested_payment_date,business_units(name),suppliers(legal_name)",
      { count: "exact" },
    )
    .eq("requester_id", ctx.user.id)
    .is("deleted_at", null);
  if (p.q)
    q = q.or(
      `request_number.ilike.%${p.q}%,supplier_legal_name.ilike.%${p.q}%,description.ilike.%${p.q}%`,
    );
  if (p.status) q = q.eq("status", p.status);
  if (p.priority) q = q.eq("priority", p.priority);
  if (p.unit) q = q.eq("business_unit_id", p.unit);
  if (p.from) q = q.gte("created_at", `${p.from}T00:00:00`);
  if (p.to) q = q.lte("created_at", `${p.to}T23:59:59`);
  const { data, count } = await q
    .order(p.sort === "oldest" ? "created_at" : "updated_at", {
      ascending: p.sort === "oldest",
    })
    .range((page - 1) * size, page * size - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  return (
    <>
      <PageHeader
        title="Mis solicitudes"
        description="Seguimiento de borradores y solicitudes enviadas."
        eyebrow="Finanzas · Gestión de Pagos"
      />
      <Panel>
        <form className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <input
            name="q"
            defaultValue={p.q}
            placeholder="Buscar"
            className="rounded-xl border p-2.5 text-sm"
          />
          <select
            name="unit"
            defaultValue={p.unit}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todas las unidades</option>
            {ctx.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={p.status}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los estados</option>
            {[
              "draft",
              "pending_approval",
              "under_review",
              "correction_requested",
              "approved",
              "rejected",
              "scheduled",
              "paid",
              "cancelled",
            ].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={p.priority}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Toda prioridad</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
            <option value="scheduled">Programado</option>
          </select>
          <input
            type="date"
            name="from"
            defaultValue={p.from}
            className="rounded-xl border p-2.5 text-sm"
          />
          <button className="rounded-xl bg-[#173f2d] px-4 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="pb-3">Correlativo</th>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Actualización</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => {
                const unit = Array.isArray(r.business_units)
                  ? r.business_units[0]
                  : r.business_units;
                const supplier = Array.isArray(r.suppliers)
                  ? r.suppliers[0]
                  : r.suppliers;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-4 font-semibold">
                      {r.request_number ?? "Borrador"}
                    </td>
                    <td>
                      {new Date(r.created_at).toLocaleDateString("es-CL")}
                    </td>
                    <td>{unit?.name}</td>
                    <td>{supplier?.legal_name}</td>
                    <td>{money.format(Number(r.amount))}</td>
                    <td>
                      <StatusBadge value={r.priority} />
                    </td>
                    <td>
                      <StatusBadge value={r.status} />
                    </td>
                    <td>
                      {new Date(r.updated_at).toLocaleDateString("es-CL")}
                    </td>
                    <td>
                      <Link
                        className="font-semibold text-[#277a55]"
                        href={`/finance/payment-control/requests/${r.id}`}
                      >
                        {r.status === "draft" ? "Continuar" : "Ver"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <div className="py-14 text-center text-sm text-slate-500">
            No encontramos solicitudes con estos filtros.
          </div>
        )}
        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
          <span>
            Página {page} de {pages} · {count ?? 0} registros
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ query: { ...p, page: page - 1 } }}
                className="rounded-lg border px-3 py-1.5"
              >
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link
                href={{ query: { ...p, page: page + 1 } }}
                className="rounded-lg border px-3 py-1.5"
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
