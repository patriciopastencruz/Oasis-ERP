import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { field } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import { listPendingRequests, personName, SUPPLY_CONSOLIDATE, supplyContext } from "@/modules/inventory/supply/application/queries";
import { sendToPurchasingAction } from "@/modules/inventory/supply/application/actions";
import { consolidateRequests, formatCoverWindow } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

/** Bodega: resumen de todo lo que piden los maestros, con la cantidad editable, y envío a compras. */
export default async function ConsolidatePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase } = await supplyContext(SUPPLY_CONSOLIDATE);
  const requests = await listPendingRequests(supabase);
  const items = consolidateRequests(requests);

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title="Generar lista de compras"
        description="Todo lo que piden los maestros, sumado por material. Ajusta las cantidades y envía a compras."
      />
      <Notice {...q} />
      {!items.length ? (
        <Panel>
          <p className="py-8 text-center text-sm text-slate-500">
            No hay solicitudes nuevas. Cuando un maestro envíe una,{" "}
            <Link href="/supply/requests" className="font-semibold text-[#0b4f9c]">
              aparecerá en Solicitudes
            </Link>
            .
          </p>
        </Panel>
      ) : (
        <form action={sendToPurchasingAction} className="space-y-4">
          {requests.map((r) => (
            <input key={r.id} type="hidden" name="request_id" value={r.id} />
          ))}
          <p className="text-sm text-slate-600">
            {requests.length} solicitud{requests.length === 1 ? "" : "es"} · {items.length} producto{items.length === 1 ? "" : "s"}
            {requests.some((r) => r.urgent) && <span className="font-semibold text-red-700"> · hay solicitudes urgentes</span>}
          </p>
          <Panel>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3">
                  <input type="hidden" name="line" value={item.lineId} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {item.name}
                      {item.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.requests} solicitud{item.requests === 1 ? "" : "es"}
                      {!item.materialId && <span className="text-amber-700"> · fuera de catálogo</span>}
                    </p>
                  </div>
                  <input
                    name="qty"
                    defaultValue={String(item.quantity).replace(".", ",")}
                    inputMode="decimal"
                    aria-label={`Cantidad de ${item.name}`}
                    className="w-24 rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-right text-base font-semibold outline-none focus:border-[var(--oasis-primary)]"
                  />
                  <span className="w-12 shrink-0 text-sm text-slate-500">{item.unit}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t pt-2 text-xs text-slate-500">Cambia la cantidad si hay que comprar menos o más. Pon 0 si no hay que comprarlo.</p>
          </Panel>

          <Panel>
            <label className="block text-sm font-medium">
              Nota para compras (opcional)
              <textarea name="notes" rows={2} maxLength={1000} className={`${field} mt-1`} />
            </label>
          </Panel>

          <details className="rounded-2xl border border-[#d9dfe6] bg-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-[#0b4f9c]">Ver las solicitudes incluidas</summary>
            <ul className="mt-2 divide-y">
              {requests.map((r) => (
                <li key={r.id} className="py-2">
                  <Link href={`/supply/requests/${r.id}`} className="font-medium text-[#0b4f9c]">
                    {[r.project?.project_number, r.project?.name].filter(Boolean).join(" · ")}
                  </Link>
                  {r.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
                  <span className="block text-xs text-slate-500">
                    {personName(r.requester_name)} · para el {formatCoverWindow(r.cover_from, r.cover_to)}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <div className="sticky bottom-0 -mx-1 border-t bg-white/95 px-1 py-3 backdrop-blur">
            <button className="w-full rounded-xl bg-[#0b4f9c] px-5 py-3.5 text-base font-semibold text-white">Enviar a compras</button>
          </div>
        </form>
      )}
    </>
  );
}
