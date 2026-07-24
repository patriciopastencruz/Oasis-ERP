import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { requireSession } from "@/modules/platform/auth/application/session";
import { activeCatalogs } from "@/modules/finance/petty-cash/application/queries";
import { pettyCashReport } from "@/modules/finance/petty-cash/application/report-query";
import { uiLabel } from "@/lib/ui-labels";
import {
  documentTypes,
  pettyCashStatuses,
} from "@/modules/finance/petty-cash/domain/petty-cash";

export default async function PettyCashReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSession();
  if (!ctx.permissions.has("finance.petty_cash.reports.view"))
    redirect("/no-access");
  const params = await searchParams;
  const { categories, centers } = await activeCatalogs();
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  const rows = await pettyCashReport(query);
  return (
    <>
      <PageHeader
        title="Reportes de Caja Chica"
        description="Filtra el detalle por gasto y exporta CSV o Excel."
        eyebrow="Finanzas · Caja Chica"
      />
      <Panel>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            name="unit"
            defaultValue={params.unit}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todas las unidades</option>
            {ctx.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            name="week"
            type="date"
            defaultValue={params.week}
            className="rounded-xl border p-2.5 text-sm"
          />
          <select
            name="status"
            defaultValue={params.status}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los estados</option>
            {pettyCashStatuses.map((status) => (
              <option key={status} value={status}>
                {uiLabel(status)}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={params.category}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todas las categorías</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            name="center"
            defaultValue={params.center}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los centros de costo</option>
            {centers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            name="merchant"
            defaultValue={params.merchant}
            placeholder="Comercio"
            className="rounded-xl border p-2.5 text-sm"
          />
          <select
            name="document_type"
            defaultValue={params.document_type}
            className="rounded-xl border p-2.5 text-sm"
          >
            <option value="">Todos los documentos</option>
            {documentTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white">
            Aplicar filtros
          </button>
        </form>
      </Panel>
      <Panel className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="pb-3">Correlativo</th>
                <th>Trabajador</th>
                <th>Unidad</th>
                <th>Fecha</th>
                <th>Comercio</th>
                <th>Categoría</th>
                <th>Centro</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, index) => (
                <tr key={`${row.correlativo}-${index}`} className="border-t">
                  <td className="py-3 font-semibold">{row.correlativo}</td>
                  <td>{row.trabajador}</td>
                  <td>{row.unidad}</td>
                  <td>{row.fecha_gasto}</td>
                  <td>{row.comercio}</td>
                  <td>{row.categoria}</td>
                  <td>{row.centro_costo}</td>
                  <td>{new Intl.NumberFormat("es-CL").format(row.monto)}</td>
                  <td>{row.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="py-10 text-center text-sm text-slate-500">
            No hay resultados para estos filtros.
          </p>
        )}
      </Panel>
      <Panel className="mt-5">
        <h2 className="font-semibold">Exportación</h2>
        <p className="mt-1 text-sm text-slate-600">
          Los archivos respetan tus unidades asignadas y los filtros
          seleccionados.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {ctx.permissions.has("finance.petty_cash.reports.export") && (
            <>
              <a
                href={`/api/finance/petty-cash/reports.csv?${query}`}
                className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                <Download size={16} /> Descargar CSV
              </a>
              <a
                href={`/api/finance/petty-cash/reports.xlsx?${query}`}
                className="flex items-center gap-2 rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Download size={16} /> Descargar Excel
              </a>
            </>
          )}
        </div>
      </Panel>
    </>
  );
}
