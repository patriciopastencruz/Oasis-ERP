import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  requestMaterialChangeAction,
  inventorySignedUrl,
} from "@/modules/inventory/application/actions";
import {
  Field,
  inputClass,
  InventoryTabs,
  Notice,
  money,
  number,
} from "@/modules/inventory/ui";
import {
  constructionUnits,
  materialCategorySegments,
} from "@/modules/inventory/domain/catalogs";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params,
    p = await searchParams,
    ctx = await requirePermission("inventory.materials.view"),
    s = await createSupabaseServerClient();
  const [{ data: m }, { data: movements }, { data: requests }] =
    await Promise.all([
      s.from("inventory_materials").select("*").eq("id", id).single(),
      s
        .from("inventory_movements")
        .select(
          "id,movement_date,movement_type,quantity_in,quantity_out,stock_after,document_reference,observation",
        )
        .eq("material_id", id)
        .order("movement_date", { ascending: false })
        .limit(50),
      s
        .from("inventory_change_requests")
        .select("id,request_type,status,reason,requested_at,decision_note")
        .eq("material_id", id)
        .order("requested_at", { ascending: false }),
    ]);
  if (!m) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title={`${m.code} · ${m.name}`}
        description={`${m.category} · ${m.unit_of_measure}`}
      />
      <InventoryTabs />
      <Notice {...p} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <Panel>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Stat
                label="Stock inicial"
                value={`${number(m.initial_stock)} ${m.unit_of_measure}`}
              />
              <Stat
                label="Stock actual"
                value={`${number(m.current_stock)} ${m.unit_of_measure}`}
              />
              <Stat label="Precio estándar" value={money(m.standard_price)} />
              <Stat
                label="Última compra"
                value={
                  m.last_purchase_price == null
                    ? "Sin compras"
                    : money(m.last_purchase_price)
                }
              />
              <Stat label="Precio promedio" value={money(m.average_price)} />
              <Stat label="Estado" value={m.status} />
            </dl>
            {m.description && (
              <p className="mt-5 border-t pt-4 text-sm text-slate-600">
                {m.description}
              </p>
            )}
            {m.image_path && (
              <form
                action={inventorySignedUrl.bind(
                  null,
                  "inventory-material-images",
                  m.image_path,
                )}
              >
                <button className="mt-4 text-sm font-semibold text-[#277a55]">
                  Abrir imagen referencial
                </button>
              </form>
            )}
          </Panel>
          {ctx.permissions.has("inventory.materials.request_change") && (
            <>
              <Panel>
                <h2 className="font-semibold">Solicitar edición</h2>
                <form
                  action={requestMaterialChangeAction}
                  className="mt-3 grid gap-3"
                >
                  <input type="hidden" name="material_id" value={m.id} />
                  <input type="hidden" name="request_type" value="edit" />
                  <Field label="Nombre">
                    <input
                      name="name"
                      defaultValue={m.name}
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label="Descripción">
                    <textarea
                      name="description"
                      defaultValue={m.description || ""}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Categoría">
                    <select
                      name="category"
                      defaultValue={m.category}
                      className={inputClass}
                      required
                    >
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
                  <Field label="Unidad">
                    <select
                      name="unit_of_measure"
                      defaultValue={m.unit_of_measure}
                      className={inputClass}
                      required
                    >
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
                  <Field label="Precio estándar">
                    <input
                      name="standard_price"
                      type="number"
                      min="0"
                      defaultValue={m.standard_price}
                      className={inputClass}
                      required
                    />
                  </Field>
                  <Field label="Motivo">
                    <textarea
                      name="reason"
                      minLength={3}
                      className={inputClass}
                      required
                    />
                  </Field>
                  <button className="rounded-xl bg-[#173f2d] px-4 py-2.5 text-white">
                    Enviar solicitud
                  </button>
                </form>
              </Panel>
              <Panel>
                <h2 className="font-semibold">Solicitar desactivación</h2>
                <form action={requestMaterialChangeAction} className="mt-3">
                  <input type="hidden" name="material_id" value={m.id} />
                  <input type="hidden" name="request_type" value="deactivate" />
                  <textarea
                    name="reason"
                    minLength={3}
                    placeholder="Motivo"
                    className={inputClass}
                    required
                  />
                  <button className="mt-3 rounded-xl border border-red-300 px-4 py-2 text-red-700">
                    Solicitar desactivación
                  </button>
                </form>
              </Panel>
            </>
          )}
        </div>
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-3 font-semibold">Historial de movimientos</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th>Entrada</th>
                    <th>Salida</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {movements?.map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className="py-3">
                        {new Date(x.movement_date).toLocaleDateString("es-CL")}
                      </td>
                      <td>{x.document_reference}</td>
                      <td>{number(x.quantity_in)}</td>
                      <td>{number(x.quantity_out)}</td>
                      <td>{number(x.stock_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-semibold">Solicitudes</h2>
            {requests?.length ? (
              <ul className="space-y-3 text-sm">
                {requests.map((x) => (
                  <li key={x.id} className="rounded-xl border p-3">
                    <b>
                      {x.request_type === "edit" ? "Edición" : "Desactivación"}{" "}
                      · {x.status}
                    </b>
                    <p>{x.reason}</p>
                    {x.decision_note && <small>{x.decision_note}</small>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sin solicitudes.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
