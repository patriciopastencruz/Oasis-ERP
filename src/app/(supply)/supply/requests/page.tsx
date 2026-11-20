import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import { listRequests, personName, SUPPLY_CONSOLIDATE, SUPPLY_REQUEST, supplyContext } from "@/modules/inventory/supply/application/queries";
import { formatCoverWindow, requestStatusLabels, type SupplyRequestStatus } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, canRequest, canConsolidate } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE);
  const requests = await listRequests(supabase);

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title={canConsolidate ? "Pedidos de materiales" : "Mis pedidos"}
        description={canConsolidate ? "Todos los pedidos de los maestros, con su estado." : "Los pedidos que has hecho para tus proyectos y en qué están."}
      />
      <Notice {...q} />
      {canRequest && (
        <Link href="/supply/requests/new" className="mb-4 inline-block rounded-xl bg-[#0b4f9c] px-5 py-3 text-sm font-semibold text-white">
          Nuevo pedido
        </Link>
      )}
      <Panel>
        {!requests.length ? (
          <p className="py-8 text-center text-sm text-slate-500">Aún no hay pedidos.</p>
        ) : (
          <ul className="divide-y">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/supply/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {[r.project?.project_number, r.project?.name].filter(Boolean).join(" · ") || "Proyecto"}
                      {r.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Para el {formatCoverWindow(r.cover_from, r.cover_to)}
                      {canConsolidate ? ` · ${personName(r.requester_name)}` : ""} · {new Date(r.created_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} label={requestStatusLabels[r.status as SupplyRequestStatus]} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
