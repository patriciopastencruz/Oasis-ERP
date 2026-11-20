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
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Inicio de Abastecimiento: lo que le toca hacer a cada persona (maestro, bodega o compras). */
export default async function SupplyHome({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { supabase, canRequest, canConsolidate, canBuy } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE, SUPPLY_BUY);
  const [mine, pending, lists] = await Promise.all([
    canRequest && !canConsolidate ? listRequests(supabase) : [],
    canConsolidate ? listPendingRequests(supabase) : [],
    canConsolidate || canBuy ? listPurchaseLists(supabase) : [],
  ]);
  const sent = mine.filter((r) => r.status === "submitted").length;
  const urgent = pending.filter((r) => r.urgent).length;
  const toBuy = lists.filter((l) => l.status === "issued").length;
  const toIssue = lists.filter((l) => l.status === "draft").length;

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Abastecimiento de materiales"
        description={
          canConsolidate
            ? "Revisa lo que piden los maestros, ajusta las cantidades y envía la lista a compras."
            : canBuy
              ? "Las listas de compras que te envía bodega."
              : "Pide los materiales que necesitas para tu proyecto."
        }
      />
      <Notice {...q} />
      <div className="grid gap-4 md:grid-cols-2">
        {canRequest && (
          <Link href="/supply/requests/new" className={`${card} border-[#0b4f9c] bg-[#edf4fc]`}>
            <p className="text-lg font-semibold">Nuevo pedido de materiales</p>
            <p className="mt-1 text-sm text-slate-600">
              {canConsolidate ? "Pide materiales para bodega." : "Elige los materiales y las cantidades para tu proyecto."}
            </p>
          </Link>
        )}
        {canRequest && !canConsolidate && (
          <Link href="/supply/requests" className={card}>
            <p className="font-semibold">Mis pedidos</p>
            <p className="mt-1 text-sm text-slate-600">{sent ? `${plural(sent, "pedido esperando", "pedidos esperando")} a bodega.` : "Revisa el estado de tus pedidos."}</p>
          </Link>
        )}
        {canConsolidate && (
          <Link href="/supply/lists" className={card}>
            <p className="font-semibold">Mis pedidos</p>
            <p className="mt-1 text-sm text-slate-600">
              Lo que enviaste a compras. {toBuy ? `${plural(toBuy, "lista", "listas")} por comprar.` : "Nada por comprar."}
              {toIssue ? ` ${plural(toIssue, "borrador", "borradores")} sin enviar.` : ""}
            </p>
          </Link>
        )}
        {canConsolidate && (
          <Link href="/supply/requests" className={`${card} ${urgent ? "border-red-300" : ""}`}>
            <p className="font-semibold">Solicitudes</p>
            <p className="mt-1 text-sm text-slate-600">
              {pending.length ? `${plural(pending.length, "solicitud nueva", "solicitudes nuevas")} de los maestros` : "No hay solicitudes nuevas."}
              {urgent ? <span className="font-semibold text-red-700"> · {plural(urgent, "urgente", "urgentes")}</span> : ""}
            </p>
          </Link>
        )}
        {canConsolidate && (
          <Link href="/supply/consolidate" className={card}>
            <p className="font-semibold">Generar lista de compras</p>
            <p className="mt-1 text-sm text-slate-600">Suma todo lo solicitado, ajusta las cantidades y envía a compras.</p>
          </Link>
        )}
        {canBuy && !canConsolidate && (
          <Link href="/supply/lists" className={card}>
            <p className="font-semibold">Listas de compras</p>
            <p className="mt-1 text-sm text-slate-600">{toBuy ? `${plural(toBuy, "lista", "listas")} por comprar.` : "Ninguna lista por comprar."}</p>
          </Link>
        )}
      </div>
      {(canConsolidate || canBuy) && (
        <Panel className="mt-6">
          <h2 className="font-semibold">Cómo funciona</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Los maestros envían sus solicitudes de materiales.</li>
            <li>Bodega las revisa, ajusta las cantidades de la lista consolidada y la envía a compras.</li>
            <li>Compras marca lo comprado y bodega lo marca recibido.</li>
          </ol>
        </Panel>
      )}
    </>
  );
}
