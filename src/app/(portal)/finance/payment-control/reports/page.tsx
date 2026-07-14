import { PageHeader, Panel } from "@/components/ui/page";
import { paymentReport } from "@/modules/finance/payment-control/application/report-query";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("finance.reports.view"),
    p = await searchParams,
    query = new URLSearchParams(
      Object.entries(p).filter((x): x is [string, string] => Boolean(x[1])),
    ),
    rows = await paymentReport(query);
  return (
    <>
      <PageHeader
        title="Reportes financieros"
        description="Consulta y exportación respetando permisos y unidades de negocio."
        eyebrow="Finanzas · Solicitud de Pagos"
      />
      <Panel>
        <form className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
          <input
            type="date"
            name="from"
            defaultValue={p.from}
            className="rounded-xl border p-2"
          />
          <input
            type="date"
            name="to"
            defaultValue={p.to}
            className="rounded-xl border p-2"
          />
          <select
            name="unit"
            defaultValue={p.unit}
            className="rounded-xl border p-2"
          >
            <option value="">Unidad</option>
            {ctx.units.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={p.status}
            className="rounded-xl border p-2"
          >
            <option value="">Estado</option>
            {[
              "draft",
              "pending_approval",
              "approved",
              "rejected",
              "scheduled",
              "paid",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={p.priority}
            className="rounded-xl border p-2"
          >
            <option value="">Prioridad</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
            <option value="scheduled">Programado</option>
          </select>
          <input
            name="supplier_text"
            defaultValue={p.supplier_text}
            placeholder="Proveedor"
            className="rounded-xl border p-2"
          />
          <input
            name="requester_text"
            defaultValue={p.requester_text}
            placeholder="Solicitante"
            className="rounded-xl border p-2"
          />
          <input
            name="approver_text"
            defaultValue={p.approver_text}
            placeholder="Aprobador"
            className="rounded-xl border p-2"
          />
          <select
            name="method"
            defaultValue={p.method}
            className="rounded-xl border p-2"
          >
            <option value="">Medio de pago</option>
            {[
              "bank_transfer",
              "card",
              "check",
              "cash",
              "petty_cash",
              "other",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <button className="rounded-xl bg-[#173f2d] text-white">
            Filtrar
          </button>
        </form>
        {ctx.permissions.has("finance.reports.export") && (
          <div className="mt-4 flex gap-2">
            <a
              href={`/api/finance/reports.csv?${query}`}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Exportar CSV
            </a>
            <a
              href={`/api/finance/reports.xlsx?${query}`}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Exportar Excel
            </a>
          </div>
        )}
      </Panel>
      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr>
                <th className="pb-3">Correlativo</th>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Medio</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((x, i) => (
                <tr key={`${x.correlativo}-${i}`} className="border-t">
                  <td className="py-3">{x.correlativo}</td>
                  <td>{new Date(x.fecha).toLocaleDateString("es-CL")}</td>
                  <td>{x.unidad}</td>
                  <td>{x.proveedor}</td>
                  <td>{new Intl.NumberFormat("es-CL").format(x.monto)}</td>
                  <td>{x.estado}</td>
                  <td>{x.medio ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="py-12 text-center text-sm text-slate-500">
            No hay resultados.
          </p>
        )}
      </Panel>
    </>
  );
}
