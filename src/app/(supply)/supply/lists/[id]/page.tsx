import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { field, StatusBadge } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import {
  getPurchaseList,
  loadCatalog,
  loadSuppliers,
  personName,
  requestsInList,
  SUPPLY_BUY,
  SUPPLY_CONSOLIDATE,
  supplyContext,
  type PurchaseItem,
} from "@/modules/inventory/supply/application/queries";
import {
  addItemAction,
  cancelListAction,
  issueListAction,
  markItemAction,
  updateItemAction,
} from "@/modules/inventory/supply/application/actions";
import {
  formatCoverWindow,
  itemStatusLabels,
  listStatusLabels,
  quantityFormat,
  type SupplyItemStatus,
  type SupplyListStatus,
} from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

const money = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
const small = "rounded-lg border border-[#d5dce4] bg-white px-2.5 py-2 text-sm outline-none focus:border-[var(--oasis-primary)]";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase, canConsolidate, canBuy } = await supplyContext(SUPPLY_CONSOLIDATE, SUPPLY_BUY);
  const found = await getPurchaseList(supabase, id);
  if (!found) notFound();
  const { list, items } = found;
  const [suppliers, catalog, requests] = await Promise.all([
    canConsolidate && list.status === "draft" ? loadSuppliers(supabase) : [],
    canConsolidate && list.status === "draft" ? loadCatalog(supabase) : [],
    canConsolidate ? requestsInList(supabase, list.id) : [],
  ]);

  const draft = list.status === "draft";
  const active = list.status === "issued" || list.status === "completed";
  const buying = canBuy && active;
  const estimated = items.filter((i) => i.status !== "covered").reduce((sum, i) => sum + (i.reference_price ?? 0) * i.quantity_to_buy, 0);

  const groups = new Map<string, PurchaseItem[]>();
  for (const item of items) {
    const key = item.status === "covered" ? "No se compra" : (item.supplier_name ?? "Sin proveedor sugerido");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === "No se compra" ? 1 : b === "No se compra" ? -1 : a.localeCompare(b)));

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title={`Lista ${list.list_number}`}
        description={`Para el ${formatCoverWindow(list.cover_from, list.cover_to)}${estimated ? ` · estimado ${money(estimated)}` : ""}`}
      />
      <Notice {...q} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={list.status} label={listStatusLabels[list.status as SupplyListStatus]} />
        {list.notes && <span className="text-sm text-slate-600">Nota: {list.notes}</span>}
      </div>
      {list.status === "cancelled" && list.cancel_reason && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">Anulada: {list.cancel_reason}</p>}

      {ordered.map(([group, rows]) => (
        <Panel key={group} className="mb-4">
          <h2 className="font-semibold">{group}</h2>
          <ul className="mt-2 divide-y">
            {rows.map((item) => (
              <li key={item.id} id={`item-${item.id}`} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{item.name}</p>
                  <div className="flex items-center gap-2">
                    {item.reference_price ? <span className="text-xs text-slate-500">ref. {money(item.reference_price)}/{item.unit}</span> : null}
                    {!draft && <StatusBadge status={item.status} label={itemStatusLabels[item.status as SupplyItemStatus]} />}
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  Comprar <b>{quantityFormat(item.quantity_to_buy)} {item.unit}</b>
                  {canConsolidate && item.requested_quantity !== item.quantity_to_buy && (
                    <span className="text-xs text-slate-500"> · pedido {quantityFormat(item.requested_quantity)}</span>
                  )}
                </p>
                {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                {item.status === "bought" && item.bought_quantity !== null && (
                  <p className="text-xs text-sky-800">Compró {quantityFormat(item.bought_quantity)} {item.unit}{item.resolution_note ? ` · ${item.resolution_note}` : ""}</p>
                )}
                {item.status === "not_found" && item.resolution_note && <p className="text-xs text-red-700">{item.resolution_note}</p>}

                {draft && canConsolidate && (
                  <form action={updateItemAction} className="mt-2 grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input name="quantity_to_buy" defaultValue={String(item.quantity_to_buy).replace(".", ",")} inputMode="decimal" aria-label="Cantidad a comprar" className={small} />
                    <select name="supplier_id" defaultValue={item.supplier_id ?? ""} aria-label="Proveedor" className={small}>
                      <option value="">Sin proveedor</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input name="note" defaultValue={item.note ?? ""} placeholder="Nota para compras" maxLength={300} className={small} />
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Guardar</button>
                  </form>
                )}

                {buying && item.status === "pending" && (
                  <div className="mt-2 flex flex-col gap-2">
                    <form action={markItemAction} className="flex items-center gap-2">
                      <input type="hidden" name="list_id" value={list.id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="action" value="bought" />
                      <input name="quantity" defaultValue={String(item.quantity_to_buy).replace(".", ",")} inputMode="decimal" aria-label="Cantidad comprada" className={`${small} w-28`} />
                      <span className="text-sm text-slate-500">{item.unit}</span>
                      <button className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white sm:flex-none">Comprado</button>
                    </form>
                    <form action={markItemAction} className="flex gap-2">
                      <input type="hidden" name="list_id" value={list.id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="action" value="not_found" />
                      <input name="note" required minLength={3} maxLength={300} placeholder="Si no lo encontraste, ¿por qué?" className={`${small} min-w-0 flex-1`} />
                      <button className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">No lo encontré</button>
                    </form>
                  </div>
                )}
                {buying && (item.status === "bought" || item.status === "not_found") && (
                  <form action={markItemAction} className="mt-2">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="action" value="reopen" />
                    <button className="text-xs font-semibold text-slate-500 underline">Deshacer</button>
                  </form>
                )}
                {canConsolidate && active && item.status === "bought" && (
                  <form action={markItemAction} className="mt-2">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="action" value="received" />
                    <button className="rounded-lg bg-[#0b4f9c] px-3 py-2 text-sm font-semibold text-white">Marcar recibido en bodega</button>
                  </form>
                )}
                {canConsolidate && active && item.status === "received" && (
                  <form action={markItemAction} className="mt-2">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="action" value="unreceive" />
                    <button className="text-xs font-semibold text-slate-500 underline">Deshacer recibido</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      {draft && canConsolidate && (
        <>
          <Panel className="mb-4">
            <h2 className="font-semibold">Agregar un producto</h2>
            <form action={addItemAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem_6rem_auto]">
              <input type="hidden" name="list_id" value={list.id} />
              <select name="material_id" aria-label="Material del catálogo" className={field}>
                <option value="">Otro (escribe el nombre)…</option>
                {catalog.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input name="quantity" required inputMode="decimal" placeholder="Cantidad" className={field} />
              <input name="unit" placeholder="Unidad" maxLength={40} className={field} />
              <input name="name" placeholder="Nombre si es otro" maxLength={160} className={`${field} sm:col-span-4`} />
              <button className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold sm:col-span-4 sm:justify-self-start">Agregar a la lista</button>
            </form>
          </Panel>
          <Panel className="mb-4">
            <form action={issueListAction}>
              <input type="hidden" name="list_id" value={list.id} />
              <p className="mb-3 text-sm text-slate-600">Revisa cantidades y proveedores. Al emitirla, compras recibe el aviso en la app y por correo.</p>
              <button className="w-full rounded-xl bg-[#0b4f9c] px-5 py-3.5 text-base font-semibold text-white sm:w-auto">Emitir al encargado de compras</button>
            </form>
          </Panel>
        </>
      )}

      {canConsolidate && (draft || list.status === "issued") && (
        <Panel className="mb-4">
          <h2 className="text-sm font-semibold">Anular la lista</h2>
          <form action={cancelListAction} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="list_id" value={list.id} />
            <input name="reason" required minLength={3} maxLength={500} placeholder="Motivo (los pedidos vuelven a la cola de bodega)" className={field} />
            <button className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">Anular lista</button>
          </form>
        </Panel>
      )}

      {canConsolidate && requests.length > 0 && (
        <Panel>
          <h2 className="font-semibold">Pedidos incluidos</h2>
          <ul className="mt-2 divide-y text-sm">
            {requests.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/supply/requests/${r.id}`} className="font-medium text-[#0b4f9c]">
                  {[r.project?.project_number, r.project?.name].filter(Boolean).join(" · ")}
                </Link>
                <span className="text-slate-500"> · {personName(r.requester_name)} · {formatCoverWindow(r.cover_from, r.cover_to)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
