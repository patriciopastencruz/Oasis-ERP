import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { field } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import { listPendingRequests, personName, SUPPLY_CONSOLIDATE, supplyContext } from "@/modules/inventory/supply/application/queries";
import { buildListAction } from "@/modules/inventory/supply/application/actions";
import { formatCoverWindow, quantityFormat } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

/** Bodega: junta los pedidos enviados por los maestros y arma la lista de compras. */
export default async function ConsolidatePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase } = await supplyContext(SUPPLY_CONSOLIDATE);
  const requests = await listPendingRequests(supabase);

  // Resumen de lo pedido contra el stock actual, por material del catálogo.
  const totals = new Map<string, { name: string; unit: string; quantity: number }>();
  for (const r of requests)
    for (const l of r.lines ?? []) {
      if (!l.material_id) continue;
      const current = totals.get(l.material_id) ?? { name: l.name, unit: l.unit, quantity: 0 };
      current.quantity += l.quantity;
      totals.set(l.material_id, current);
    }
  const stock = new Map<string, number>();
  if (totals.size) {
    const { data } = await supabase.from("inventory_materials").select("id,current_stock").in("id", [...totals.keys()]);
    for (const m of data ?? []) stock.set(m.id, Number(m.current_stock));
  }
  const customCount = requests.reduce((n, r) => n + (r.lines ?? []).filter((l) => !l.material_id).length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title="Pedidos por revisar"
        description="Elige los pedidos de los maestros que entran en la compra. La lista descuenta el stock y lo que ya está comprado y por llegar."
      />
      <Notice {...q} />
      {!requests.length ? (
        <Panel>
          <p className="py-8 text-center text-sm text-slate-500">No hay pedidos esperando. Cuando un maestro envíe uno, aparecerá aquí.</p>
        </Panel>
      ) : (
        <form action={buildListAction} className="space-y-5">
          <div className="space-y-3">
            {requests.map((r) => (
              <label key={r.id} className={`block rounded-2xl border bg-white p-4 ${r.urgent ? "border-red-300" : "border-[#d9dfe6]"}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" name="request_id" value={r.id} defaultChecked className="mt-1 size-5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">
                        {[r.project?.project_number, r.project?.name].filter(Boolean).join(" · ")}
                        {r.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
                      </p>
                      <span className="text-xs text-slate-500">
                        {personName(r.requester_name)} · para el {formatCoverWindow(r.cover_from, r.cover_to)}
                      </span>
                    </div>
                    {r.urgent && r.urgent_reason && <p className="mt-1 text-sm text-red-800">{r.urgent_reason}</p>}
                    <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                      {r.lines?.map((l) => (
                        <li key={l.id} className="flex min-w-0 justify-between gap-3">
                          <span className="min-w-0 truncate">{l.name}{!l.material_id && <span className="text-amber-700"> (fuera de catálogo)</span>}</span>
                          <span className="whitespace-nowrap font-medium">{quantityFormat(l.quantity)} {l.unit}</span>
                        </li>
                      ))}
                    </ul>
                    {r.notes && <p className="mt-2 text-xs text-slate-500">Comentario: {r.notes}</p>}
                    <Link href={`/supply/requests/${r.id}`} className="mt-2 inline-block text-xs font-semibold text-[#0b4f9c]">Ver detalle</Link>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {totals.size > 0 && (
            <Panel>
              <h2 className="font-semibold">Resumen de lo pedido y stock en bodega</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr><th className="py-1.5">Material</th><th className="text-right">Pedido</th><th className="text-right">Stock</th><th className="text-right">Faltaría</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...totals.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, t]) => {
                      const have = stock.get(id);
                      const missing = have === undefined ? null : Math.max(0, t.quantity - have);
                      return (
                        <tr key={id}>
                          <td className="py-1.5">{t.name}</td>
                          <td className="text-right">{quantityFormat(t.quantity)} {t.unit}</td>
                          <td className="text-right">{have === undefined ? "—" : quantityFormat(have)}</td>
                          <td className={`text-right font-medium ${missing ? "text-amber-700" : "text-emerald-700"}`}>{missing === null ? "—" : quantityFormat(missing)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Referencial: la lista también descuenta lo ya comprado y por llegar de otras listas.
                {customCount ? ` Hay ${customCount} producto${customCount === 1 ? "" : "s"} fuera de catálogo que se compran completos.` : ""}
              </p>
            </Panel>
          )}

          <Panel>
            <label className="block text-sm font-medium">
              Nota para compras (opcional)
              <textarea name="notes" rows={2} maxLength={1000} className={`${field} mt-1`} />
            </label>
            <button className="mt-3 w-full rounded-xl bg-[#0b4f9c] px-5 py-3.5 text-base font-semibold text-white sm:w-auto">
              Armar lista de compras
            </button>
          </Panel>
        </form>
      )}
    </>
  );
}
