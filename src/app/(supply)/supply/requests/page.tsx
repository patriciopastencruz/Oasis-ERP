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

/** Maestro: «Mis pedidos». Bodega: «Solicitudes», todo lo que mandan los maestros, separado por obra. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; ver?: string }> }) {
  const q = await searchParams;
  const { supabase, canRequest, canConsolidate } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE);
  const all = canConsolidate ? await listAllRequests(supabase) : (await listRequests(supabase)).map((r) => ({ ...r, lines: undefined }));
  const pending = all.filter((r) => r.status === "submitted");
  const inPurchasing = all.filter((r) => r.status === "in_list");
  const filter = canConsolidate && (q.ver === "nuevas" || q.ver === "compras") ? q.ver : "todas";
  const requests = !canConsolidate || filter === "todas" ? all : filter === "nuevas" ? pending : inPurchasing;

  // Bodega: una sección por obra; dentro, los pedidos de cada maestro.
  const byProject = new Map<string, { title: string; items: typeof requests }>();
  if (canConsolidate)
    for (const r of requests) {
      const group = byProject.get(r.project_id) ?? { title: [r.project?.project_number, r.project?.name].filter(Boolean).join(" · ") || "Proyecto", items: [] };
      group.items.push(r);
      byProject.set(r.project_id, group);
    }

  const requestRow = (r: (typeof requests)[number]) => (
    <li key={r.id}>
      <Link href={`/supply/requests/${r.id}`} className="block py-3 hover:bg-slate-50">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">
              {canConsolidate ? personName(r.requester_name) : [r.project?.project_number, r.project?.name].filter(Boolean).join(" · ") || "Proyecto"}
              {r.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">URGENTE</span>}
            </p>
            <p className="text-xs text-slate-500">
              para el {formatCoverWindow(r.cover_from, r.cover_to)} · {new Date(r.created_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}
            </p>
          </div>
          <StatusBadge status={r.status} label={requestStatusLabels[r.status as SupplyRequestStatus]} />
        </div>
        {r.urgent && r.urgent_reason && <p className="mt-1 text-sm text-red-800">{r.urgent_reason}</p>}
        {r.lines && r.lines.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-700">
            {r.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="min-w-0">{l.name}</span>
                <span className="shrink-0 font-medium">
                  {quantityFormat(l.quantity)} {l.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="Abastecimiento"
        title={canConsolidate ? "Solicitudes" : "Mis pedidos"}
        description={canConsolidate ? "Todo lo que piden los maestros, separado por obra." : "Los pedidos que has hecho para tus proyectos y en qué están."}
      />
      <Notice {...q} />
      {canConsolidate ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/supply/requests" className={chip(filter === "todas")}>
            Todas ({all.length})
          </Link>
          <Link href="/supply/requests?ver=nuevas" className={chip(filter === "nuevas")}>
            Por enviar a compras ({pending.length})
          </Link>
          <Link href="/supply/requests?ver=compras" className={chip(filter === "compras")}>
            En compras ({inPurchasing.length})
          </Link>
          {pending.length > 0 && (
            <Link href="/supply/consolidate" className="w-full rounded-xl bg-[#0b4f9c] px-4 py-3 text-center text-sm font-semibold text-white sm:ml-auto sm:w-auto">
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
      {!requests.length ? (
        <Panel>
          <p className="py-8 text-center text-sm text-slate-500">{canConsolidate ? "No hay solicitudes en esta vista." : "Aún no hay pedidos."}</p>
        </Panel>
      ) : canConsolidate ? (
        <div className="space-y-4">
          {[...byProject.entries()].map(([projectId, group]) => (
            <Panel key={projectId}>
              <h2 className="font-semibold">{group.title}</h2>
              <p className="text-xs text-slate-500">
                {group.items.length} pedido{group.items.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-2 divide-y">{group.items.map(requestRow)}</ul>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <ul className="divide-y">{requests.map(requestRow)}</ul>
        </Panel>
      )}
    </>
  );
}
