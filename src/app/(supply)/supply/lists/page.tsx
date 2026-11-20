import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import { listPurchaseLists, SUPPLY_BUY, SUPPLY_CONSOLIDATE, supplyContext } from "@/modules/inventory/supply/application/queries";
import { formatCoverWindow, listStatusLabels, type SupplyListStatus } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, canConsolidate } = await supplyContext(SUPPLY_CONSOLIDATE, SUPPLY_BUY);
  const lists = await listPurchaseLists(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title="Listas de compras"
        description={canConsolidate ? "Las listas que arma bodega y cómo va cada compra." : "Las listas que te asignó bodega para comprar."}
      />
      <Notice {...q} />
      <Panel>
        {!lists.length ? (
          <p className="py-8 text-center text-sm text-slate-500">Todavía no hay listas de compras.</p>
        ) : (
          <ul className="divide-y">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={`/supply/lists/${l.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50">
                  <div>
                    <p className="font-semibold">{l.list_number}</p>
                    <p className="text-xs text-slate-500">
                      Para el {formatCoverWindow(l.cover_from, l.cover_to)} · {l.counts?.total ?? 0} productos
                      {l.status === "issued" || l.status === "completed" ? ` · ${l.counts?.done ?? 0} comprados` : ""}
                      {l.counts?.missing ? ` · ${l.counts.missing} sin encontrar` : ""}
                      {l.status === "issued" && l.counts?.pending ? ` · faltan ${l.counts.pending}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={l.status} label={listStatusLabels[l.status as SupplyListStatus]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
