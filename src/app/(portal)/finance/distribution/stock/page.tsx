import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileImage,
  PackageOpen,
} from "lucide-react";
import { InvoiceLines } from "@/components/inventory/invoice-lines";
import {
  Flash,
  buttonClass,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  registerDistributionStockInvoiceAction,
  registerDistributionStockOutputAction,
} from "@/modules/finance/distribution/application/stock-actions";
import { distributionContext } from "@/modules/finance/distribution/application/queries";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const quantity = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

type InvoiceLine = {
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  inventory_materials: { name: string } | null;
};
type Invoice = {
  id: string;
  invoice_number: string;
  purchase_date: string;
  attachment_path: string | null;
  suppliers: { legal_name: string } | null;
  inventory_purchase_lines: InvoiceLine[];
  attachmentUrl?: string;
};
type Movement = {
  id: string;
  movement_date: string;
  movement_type:
    "initial_stock" | "purchase" | "operational_consumption" | "loss";
  quantity_in: number | string;
  quantity_out: number | string;
  stock_after: number | string;
  document_reference: string | null;
  inventory_materials: { name: string; unit_of_measure: string } | null;
};

export default async function DistributionStock({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, company, supabase } = await distributionContext(
    "finance.distribution.stock.view",
  );
  const { error: catalogError } = await supabase.rpc(
    "ensure_distribution_stock_catalog",
    { target_unit: unit.id },
  );
  if (catalogError)
    throw new Error(`No se pudo preparar el catálogo: ${catalogError.message}`);

  const [materialsResult, suppliersResult, invoicesResult, movementsResult] =
    await Promise.all([
      supabase
        .from("inventory_materials")
        .select(
          "id,code,name,category,unit_of_measure,current_stock,last_purchase_price,average_price,purchased_quantity,purchased_value",
        )
        .eq("business_unit_id", unit.id)
        .like("code", "DA-MP-%")
        .eq("status", "active")
        .order("category")
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,legal_name,trade_name")
        .eq("company_id", company.id)
        .eq("active", true)
        .is("deleted_at", null)
        .order("legal_name"),
      supabase
        .from("inventory_purchase_invoices")
        .select(
          "id,invoice_number,purchase_date,attachment_path,suppliers(legal_name),inventory_purchase_lines(quantity,unit_price,line_total,inventory_materials(name))",
        )
        .eq("business_unit_id", unit.id)
        .order("purchase_date", { ascending: false })
        .order("entered_at", { ascending: false })
        .limit(10),
      supabase
        .from("inventory_movements")
        .select(
          "id,movement_date,movement_type,quantity_in,quantity_out,stock_after,document_reference,inventory_materials(name,unit_of_measure)",
        )
        .eq("business_unit_id", unit.id)
        .order("movement_date", { ascending: false })
        .limit(15),
    ]);
  const loadError =
    materialsResult.error ??
    suppliersResult.error ??
    invoicesResult.error ??
    movementsResult.error;
  if (loadError)
    throw new Error(`No se pudo consultar el stock: ${loadError.message}`);

  const materials = materialsResult.data ?? [];
  const rawInvoices = (invoicesResult.data ?? []) as unknown as Invoice[];
  const invoices = await Promise.all(
    rawInvoices.map(async (invoice) => {
      if (!invoice.attachment_path) return invoice;
      const { data } = await supabase.storage
        .from("inventory-invoices")
        .createSignedUrl(invoice.attachment_path, 600);
      return { ...invoice, attachmentUrl: data?.signedUrl };
    }),
  );
  const movements = (movementsResult.data ?? []) as unknown as Movement[];
  const canManage = ctx.permissions.has("finance.distribution.stock.manage");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const stockTotal = materials.reduce(
    (sum, material) => sum + Number(material.current_stock || 0),
    0,
  );
  const inventoryValue = materials.reduce(
    (sum, material) =>
      sum +
      Number(material.current_stock || 0) * Number(material.average_price || 0),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Stock materia prima"
        description="Control de bolsas y envases mediante facturas de compra, consumos y pérdidas, con trazabilidad de cada movimiento."
      />
      <Flash success={q.success} error={q.error} />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-[var(--oasis-soft)] text-[var(--oasis-primary)]">
            <PackageOpen size={20} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Productos controlados</p>
            <b className="text-xl">{materials.length}</b>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <ArrowDownToLine size={20} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Unidades disponibles</p>
            <b className="text-xl">{quantity.format(stockTotal)}</b>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <FileImage size={20} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Facturas registradas</p>
            <b className="text-xl">{invoices.length}</b>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <ArrowUpFromLine size={20} />
          </span>
          <div>
            <p className="text-xs text-slate-500">Valor estimado del stock</p>
            <b className="text-xl">{clp.format(inventoryValue)}</b>
          </div>
        </Panel>
      </section>

      <Panel className="mb-5 overflow-hidden p-0">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Existencias actuales</h2>
          <p className="text-xs text-slate-500">
            El saldo aumenta con facturas y disminuye con consumos o pérdidas.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Materia prima</th>
                <th>Categoría</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Último precio</th>
                <th className="px-5 text-right">Valor estimado</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => (
                <tr key={material.id} className="border-t">
                  <td className="px-5 py-3">
                    <b>{material.name}</b>
                    <p className="font-mono text-xs text-slate-500">
                      {material.code}
                    </p>
                  </td>
                  <td>{material.category}</td>
                  <td className="text-right font-bold">
                    {quantity.format(Number(material.current_stock))}{" "}
                    {material.unit_of_measure}
                  </td>
                  <td className="text-right">
                    {clp.format(Number(material.last_purchase_price || 0))}
                  </td>
                  <td className="px-5 text-right font-semibold">
                    {clp.format(
                      Number(material.current_stock) *
                        Number(material.average_price),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {canManage && (
        <div className="mb-5 grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_420px]">
          <Panel>
            <h2 className="font-semibold">Ingresar factura de compra</h2>
            <p className="mb-4 text-xs text-slate-500">
              La cantidad de cada línea se sumará automáticamente al stock.
            </p>
            {suppliersResult.data?.length ? (
              <form
                action={registerDistributionStockInvoiceAction}
                className="space-y-5"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    Nº de factura
                    <input
                      className={inputClass}
                      name="invoice_number"
                      maxLength={80}
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Proveedor
                    <select className={inputClass} name="supplier_id" required>
                      <option value="">Selecciona un proveedor</option>
                      {suppliersResult.data.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.trade_name || supplier.legal_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Fecha de compra
                    <input
                      className={inputClass}
                      name="purchase_date"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </label>
                </div>
                <InvoiceLines materials={materials} />
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    Foto o PDF de la factura
                    <input
                      className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--oasis-soft)] file:px-3 file:py-1.5 file:font-semibold file:text-[var(--oasis-primary)]`}
                      name="attachment"
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      required
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      JPG, PNG o PDF, máximo 10 MB.
                    </span>
                  </label>
                  <label className="text-sm">
                    Observaciones
                    <textarea
                      className={inputClass}
                      name="observations"
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                </div>
                <button className={buttonClass}>
                  Registrar factura y aumentar stock
                </button>
              </form>
            ) : (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Primero debes registrar un proveedor activo en el módulo
                Proveedores.
              </p>
            )}
          </Panel>

          <Panel>
            <h2 className="font-semibold">Registrar salida</h2>
            <p className="mb-4 text-xs text-slate-500">
              Descuenta bolsas o envases usados en producción o perdidos.
            </p>
            <form
              action={registerDistributionStockOutputAction}
              className="space-y-3"
            >
              <label className="block text-sm">
                Producto
                <select className={inputClass} name="material_id" required>
                  <option value="">Selecciona un producto</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} · Stock{" "}
                      {quantity.format(Number(material.current_stock))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Fecha
                  <input
                    className={inputClass}
                    name="output_date"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </label>
                <label className="text-sm">
                  Cantidad
                  <input
                    className={inputClass}
                    name="quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                  />
                </label>
              </div>
              <label className="block text-sm">
                Tipo
                <select className={inputClass} name="output_type">
                  <option value="operational_consumption">
                    Consumo operacional
                  </option>
                  <option value="loss">Pérdida o daño</option>
                </select>
              </label>
              <label className="block text-sm">
                Motivo u observación
                <textarea
                  className={inputClass}
                  name="reason"
                  maxLength={500}
                  rows={3}
                />
              </label>
              <button className={buttonClass}>Registrar salida</button>
            </form>
          </Panel>
        </div>
      )}

      <div className="grid gap-5 2xl:grid-cols-2">
        <Panel className="overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Últimas facturas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Fecha / factura</th>
                  <th>Proveedor</th>
                  <th>Productos</th>
                  <th className="px-5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr className="border-t" key={invoice.id}>
                    <td className="px-5 py-3">
                      <b>{invoice.purchase_date}</b>
                      <p>
                        {invoice.attachmentUrl ? (
                          <a
                            className="text-[var(--oasis-primary)] underline"
                            href={invoice.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Factura {invoice.invoice_number}
                          </a>
                        ) : (
                          `Factura ${invoice.invoice_number}`
                        )}
                      </p>
                    </td>
                    <td>{invoice.suppliers?.legal_name}</td>
                    <td>
                      {invoice.inventory_purchase_lines
                        .map(
                          (line) =>
                            `${line.inventory_materials?.name}: ${quantity.format(Number(line.quantity))}`,
                        )
                        .join(" · ")}
                    </td>
                    <td className="px-5 text-right font-bold">
                      {clp.format(
                        invoice.inventory_purchase_lines.reduce(
                          (sum, line) => sum + Number(line.line_total),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                ))}
                {!invoices.length && (
                  <tr>
                    <td className="p-7 text-center text-slate-500" colSpan={4}>
                      Aún no hay facturas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <h2 className="font-semibold">Últimos movimientos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th>Producto</th>
                  <th className="text-right">Entrada</th>
                  <th className="text-right">Salida</th>
                  <th className="px-5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr className="border-t" key={movement.id}>
                    <td className="px-5 py-3">
                      {new Date(movement.movement_date).toLocaleDateString(
                        "es-CL",
                        { timeZone: "America/Santiago" },
                      )}
                      <p className="text-xs text-slate-500">
                        {movement.document_reference}
                      </p>
                    </td>
                    <td>{movement.inventory_materials?.name}</td>
                    <td className="text-right font-semibold text-emerald-700">
                      {Number(movement.quantity_in)
                        ? `+${quantity.format(Number(movement.quantity_in))}`
                        : "—"}
                    </td>
                    <td className="text-right font-semibold text-red-700">
                      {Number(movement.quantity_out)
                        ? `-${quantity.format(Number(movement.quantity_out))}`
                        : "—"}
                    </td>
                    <td className="px-5 text-right font-bold">
                      {quantity.format(Number(movement.stock_after))}
                    </td>
                  </tr>
                ))}
                {!movements.length && (
                  <tr>
                    <td className="p-7 text-center text-slate-500" colSpan={5}>
                      Aún no hay movimientos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
