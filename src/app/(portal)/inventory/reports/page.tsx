import { PageHeader, Panel } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { InventoryTabs, inputClass } from "@/modules/inventory/ui";
const reports = [
  [
    "stock",
    "Stock de materiales",
    "Existencias, entradas, salidas, precios, valoración y consumo promedio.",
  ],
  ["invoices", "Facturas", "Compras por proveedor, material, fecha y usuario."],
  [
    "outputs",
    "Salidas",
    "Consumo operacional, fallas, pérdidas y variación de stock.",
  ],
  ["movements", "Movimientos", "Registro general de entradas y salidas."],
] as const;
export default async function Page() {
  await requirePermission("inventory.reports.export");
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Reportes de inventario"
        description="Descarga información en Excel para análisis y control."
      />
      <InventoryTabs />
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map(([type, title, description]) => (
          <Panel key={type}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
            <form
              action="/api/inventory/reports.xlsx"
              className="mt-4 grid gap-2 sm:grid-cols-2"
            >
              <input type="hidden" name="type" value={type} />
              <label className="text-xs">
                Desde
                <input name="from" type="date" className={inputClass} />
              </label>
              <label className="text-xs">
                Hasta
                <input name="to" type="date" className={inputClass} />
              </label>
              <button className="rounded-xl bg-[#173f2d] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
                Descargar Excel
              </button>
            </form>
          </Panel>
        ))}
      </div>
    </>
  );
}
