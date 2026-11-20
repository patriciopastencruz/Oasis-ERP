import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { Notice } from "@/modules/inventory/ui";
import {
  listPendingRequests,
  listPurchaseLists,
  listRequests,
  SUPPLY_BUY,
  SUPPLY_CONSOLIDATE,
  SUPPLY_REQUEST,
  supplyContext,
} from "@/modules/inventory/supply/application/queries";

export const dynamic = "force-dynamic";

const card = "block rounded-2xl border border-[#d9dfe6] bg-white p-5 shadow-[0_10px_30px_rgba(20,57,39,.04)] hover:border-[#0b4f9c]";

/** Inicio de Abastecimiento: lo que le toca hacer a cada persona (maestro, bodega o compras). */
export default async function SupplyHome({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, canRequest, canConsolidate, canBuy } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE, SUPPLY_BUY);
  const [mine, pending, lists] = await Promise.all([
    canRequest ? listRequests(supabase) : [],
    canConsolidate ? listPendingRequests(supabase) : [],
    canConsolidate || canBuy ? listPurchaseLists(supabase) : [],
  ]);
  const drafts = mine.filter((r) => r.status === "draft").length;
  const sent = mine.filter((r) => r.status === "submitted").length;
  const urgent = pending.filter((r) => r.urgent).length;
  const toBuy = lists.filter((l) => l.status === "issued");
  const toIssue = lists.filter((l) => l.status === "draft").length;

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Abastecimiento de materiales"
        description="El maestro pide lo que necesita para los próximos 2 días, bodega junta los pedidos y arma la lista de compras, y compras la ejecuta."
      />
      <Notice {...q} />
      <div className="grid gap-4 md:grid-cols-2">
        {canRequest && (
          <Link href="/supply/requests/new" className={`${card} border-[#0b4f9c] bg-[#edf4fc]`}>
            <p className="text-lg font-semibold">Nuevo pedido de materiales</p>
            <p className="mt-1 text-sm text-slate-600">Elige los materiales y las cantidades para tu proyecto.</p>
          </Link>
        )}
        {canRequest && (
          <Link href="/supply/requests" className={card}>
            <p className="font-semibold">Mis pedidos</p>
            <p className="mt-1 text-sm text-slate-600">
              {drafts ? `${drafts} borrador${drafts === 1 ? "" : "es"} sin enviar. ` : ""}
              {sent ? `${sent} esperando a bodega.` : !drafts ? "Revisa el estado de tus pedidos." : ""}
            </p>
          </Link>
        )}
        {canConsolidate && (
          <Link href="/supply/consolidate" className={`${card} ${urgent ? "border-red-300" : ""}`}>
            <p className="font-semibold">Pedidos por revisar</p>
            <p className="mt-1 text-sm text-slate-600">
              {pending.length ? `${pending.length} pedido${pending.length === 1 ? "" : "s"} esperando` : "No hay pedidos pendientes."}
              {urgent ? <span className="font-semibold text-red-700"> · {urgent} urgente{urgent === 1 ? "" : "s"}</span> : ""}
            </p>
          </Link>
        )}
        {(canConsolidate || canBuy) && (
          <Link href="/supply/lists" className={card}>
            <p className="font-semibold">Listas de compras</p>
            <p className="mt-1 text-sm text-slate-600">
              {toBuy.length ? `${toBuy.length} lista${toBuy.length === 1 ? "" : "s"} por comprar. ` : "Ninguna lista por comprar. "}
              {canConsolidate && toIssue ? `${toIssue} en borrador por emitir.` : ""}
            </p>
          </Link>
        )}
      </div>
      <Panel className="mt-6">
        <h2 className="font-semibold">Cómo funciona</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Cada tarde el maestro envía su pedido para los próximos 2 días.</li>
          <li>Bodega revisa todos los pedidos y arma una sola lista: lo pedido menos el stock y menos lo que ya está en camino.</li>
          <li>Bodega emite la lista y compras recibe el aviso en la app y por correo.</li>
          <li>Compras marca lo comprado y bodega lo marca recibido.</li>
        </ol>
      </Panel>
    </>
  );
}
