import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { clp } from "@/modules/sales/quotations/domain/quotation";
import {
  saveProductAction,
  toggleProductAction,
} from "@/modules/sales/quotations/application/actions";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { Notice } from "@/modules/sales/ui";

export default async function ProductsCatalog({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; edit?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await salesContext("sales.quotations.approve");
  const { data: products } = await supabase
    .from("om_products")
    .select("id,name,description,unit_price,active")
    .eq("business_unit_id", unit.id)
    .order("name");
  const edit = products?.find((p) => p.id === q.edit);
  const input = "mt-1 w-full rounded-xl border p-2.5 text-sm";
  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Catálogo de productos"
        description="Precios estándar disponibles al armar una cotización."
      />
      <Notice success={q.success} error={q.error} />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr>
                  <th className="pb-3">Producto</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products?.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="py-4">
                      <b>{p.name}</b>
                      {p.description && (
                        <small className="block text-slate-500">
                          {p.description}
                        </small>
                      )}
                    </td>
                    <td>{clp.format(Number(p.unit_price))}</td>
                    <td>{p.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div className="flex gap-3">
                        <Link
                          href={`/sales/quotations/products?edit=${p.id}`}
                          className="font-semibold text-[var(--oasis-primary)]"
                        >
                          Editar
                        </Link>
                        <form action={toggleProductAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!p.active)}
                          />
                          <button className="font-semibold text-slate-600">
                            {p.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!products?.length && (
            <p className="py-12 text-center text-sm text-slate-500">
              No hay productos en el catálogo.
            </p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-4 font-semibold">
            {edit ? "Editar producto" : "Agregar producto"}
          </h2>
          <form action={saveProductAction} key={edit?.id ?? "new"} className="space-y-3">
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <label className="block text-sm">
              Nombre
              <input
                name="name"
                defaultValue={edit?.name}
                className={input}
                required
              />
            </label>
            <label className="block text-sm">
              Descripción
              <textarea
                name="description"
                defaultValue={edit?.description ?? ""}
                className={`${input} min-h-20`}
              />
            </label>
            <label className="block text-sm">
              Precio (CLP)
              <input
                name="unit_price"
                type="number"
                min="0"
                step="1"
                defaultValue={edit?.unit_price}
                className={input}
                required
              />
            </label>
            <button className="w-full rounded-xl bg-[var(--oasis-primary)] px-4 py-3 font-semibold text-white">
              Guardar
            </button>
            {edit && (
              <Link
                href="/sales/quotations/products"
                className="block text-center text-sm text-slate-500"
              >
                Cancelar edición
              </Link>
            )}
          </form>
        </Panel>
      </div>
    </>
  );
}
