import { PageHeader, Panel } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { createMaterialAction } from "@/modules/inventory/application/actions";
import { Field, inputClass, Notice } from "@/modules/inventory/ui";
import {
  constructionUnits,
  materialCategorySegments,
} from "@/modules/inventory/domain/catalogs";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const p = await searchParams,
    ctx = await requirePermission("inventory.materials.create"),
    units = ctx.units.filter(
      (x) => x.code === "OM" || x.name.toLowerCase().includes("modular"),
    );
  return (
    <>
      <PageHeader
        eyebrow="Inventario · Oasis Modulares"
        title="Nuevo material"
        description="El código MAT se asignará automáticamente y el stock inicial quedará registrado como movimiento."
      />
      <Notice {...p} />
      <Panel>
        <form
          action={createMaterialAction}
          className="grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="company_id" value={ctx.companies[0]?.id} />
          <Field label="Unidad">
            <select name="business_unit_id" required className={inputClass}>
              <option value="">Selecciona</option>
              {(units.length ? units : ctx.units).map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input
              name="name"
              required
              maxLength={180}
              className={inputClass}
            />
          </Field>
          <Field label="Categoría">
            <select
              name="category"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona una categoría
              </option>
              {materialCategorySegments.map((group) => (
                <optgroup label={group.segment} key={group.segment}>
                  {group.categories.map((category) => (
                    <option value={category} key={category}>
                      {category}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Unidad de medida">
            <select
              name="unit_of_measure"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona una unidad
              </option>
              {constructionUnits.map((group) => (
                <optgroup label={group.group} key={group.group}>
                  {group.values.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Precio estándar CLP">
            <input
              name="standard_price"
              type="number"
              min="0"
              step="1"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Stock inicial">
            <input
              name="initial_stock"
              type="number"
              min="0"
              step="0.001"
              required
              defaultValue="0"
              className={inputClass}
            />
          </Field>
          <Field label="Imagen referencial (JPG/PNG, máx. 5 MB)">
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png"
              className={inputClass}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Descripción">
              <textarea
                name="description"
                maxLength={500}
                className={inputClass}
              />
            </Field>
          </div>
          <button className="rounded-xl bg-[#173f2d] px-4 py-3 font-semibold text-white md:col-span-2">
            Crear material
          </button>
        </form>
      </Panel>
    </>
  );
}
