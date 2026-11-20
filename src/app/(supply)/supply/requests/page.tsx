import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/supply/supply-ui";
import { Notice } from "@/modules/inventory/ui";
import {
  listAllRequests,
  listRequests,
  personName,
  SUPPLY_CONSOLIDATE,
  SUPPLY_REQUEST,
  supplyContext,
} from "@/modules/inventory/supply/application/queries";
import { formatCoverWindow, quantityFormat, requestStatusLabels, type SupplyRequestStatus } from "@/modules/inventory/supply/domain/supply";

export const dynamic = "force-dynamic";

const chip = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-[#0b2f5f] text-white" : "border border-[#d5dce4] bg-white text-slate-700"}`;

/** Maestro: «Mis pedidos». Bodega: «Solicitudes», todo lo que mandan los maestros. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; ver?: string }> }) {
  const q = await searchParams;
  const { supabase, canRequest, canConsolidate } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE);
  const all = canConsolidate ? await listAllRequests(supabase) : (await listRequests(supabase)).map((r) => ({ ...r, lines: undefined }));
  const pending = all.filter((r) => r.status === "submitted");
  const showAll = !canConsolidate || q.ver === "todas";
  const requests = showAll ? all : pending;

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title={canConsolidate ? "Solicitudes" : "Mis pedidos"}
        description={canConsolidate ? "Lo que piden los maestros." : "Los pedidos que has hecho para tus proyectos y en qué están."}
      />
      <Notice {...q} />
      {canConsolidate ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/supply/requests" className={chip(!showAll)}>
            Nuevas ({pending.length})
          </Link>
          <Link href="/supply/requests?ver=todas" className={chip(showAll)}>
            Todas ({all.length})
          </Link>
          {pending.length > 0 && (
            <Link href="/supply/consolidate" className="ml-auto rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white">
              Generar lista de compras
            </Link>
          )}
        </div>
      ) : (
        canRequest && (
          <Link href="/supply/requests/new" className="mb-4 inline-block rounded-xl bg-[#0b4f9c] px-5 py-3 text-sm font-semibold text-white">
            Nuevo pedido
          </Link>
        )
      )}
      <Panel>
        {!requests.length ? (
          <p className="py-8 text-center text-sm text-slate-500">{canConsolidate && !showAll ? "No hay solicitudes nuevas." : "Aún no hay pedidos."}</p>
        ) : (
          <ul className="divide-y">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/supply/requests/${r.id}`} className="block py-3 hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {[r.project?.project_number, r.project?.name].filter(Boolean).join(" · ") || "Proyecto"}
                        {r.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {canConsolidate ? `${personName(r.requester_name)} · ` : ""}para el {formatCoverWindow(r.cover_from, r.cover_to)} ·{" "}
                        {new Date(r.created_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}
                      </p>
                    </div>
                    <StatusBadge status={r.status} label={requestStatusLabels[r.status as SupplyRequestStatus]} />
                  </div>
                  {r.lines && r.lines.length > 0 && (
                    <p className="mt-1 text-sm text-slate-600">
                      {r.lines
                        .slice(0, 3)
                        .map((l) => `${l.name} ×${quantityFormat(l.quantity)}`)
                        .join(" · ")}
                      {r.lines.length > 3 ? ` · y ${r.lines.length - 3} más` : ""}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
