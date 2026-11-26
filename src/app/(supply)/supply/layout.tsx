import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { oasisTheme } from "@/components/layout/oasis-theme";
import { BackButton } from "@/components/layout/back-button";
import { SupplyNav } from "@/components/supply/supply-nav";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { SUPPLY_BUY, SUPPLY_CONSOLIDATE, SUPPLY_REQUEST, supplyContext } from "@/modules/inventory/supply/application/queries";

export const metadata: Metadata = {
  title: "Abastecimiento · Oasis Modulares",
  description: "Pedidos de materiales, lista de compras y compras de Oasis Modulares.",
};
export const viewport: Viewport = { themeColor: "#0b2f5f", width: "device-width", initialScale: 1 };

/** Portal ligero pensado para el celular del maestro, del encargado de bodega y del de compras. */
export default async function SupplyLayout({ children }: { children: React.ReactNode }) {
  const { ctx, unit, canRequest, canConsolidate, canBuy } = await supplyContext(SUPPLY_REQUEST, SUPPLY_CONSOLIDATE, SUPPLY_BUY);
  // Maestro: nuevo pedido y sus pedidos. Bodega: nuevo pedido, lo que envió a compras, las solicitudes y generar la lista.
  const items = canConsolidate
    ? [
        ...(canRequest ? [{ href: "/supply/requests/new", label: "Nuevo pedido" }] : []),
        { href: "/supply/lists", label: "Mis pedidos" },
        { href: "/supply/requests", label: "Solicitudes" },
        { href: "/supply/consolidate", label: "Generar lista" },
      ]
    : [
        ...(canRequest ? [{ href: "/supply/requests/new", label: "Nuevo pedido" }, { href: "/supply/requests", label: "Mis pedidos" }] : []),
        ...(canBuy ? [{ href: "/supply/lists", label: "Listas de compras" }] : []),
      ];
  const hasErp = ctx.permissions.has("inventory.materials.view") || ctx.permissions.has("administration.approvals.view");
  return (
    <div className="min-h-screen bg-[#f3f6fa] text-[#16202c]" style={oasisTheme}>
      <header className="sticky top-0 z-20 bg-[#0b2f5f] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white shadow">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <BackButton fallback="/supply" hideOn={["/supply"]} className="border-white/30 bg-white/10 text-white" />
          <Link href="/supply" className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9fb8d9]">Abastecimiento</p>
            <p className="truncate text-lg font-bold">{unit.name}</p>
          </Link>
          {hasErp && (
            <Link href="/" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
              Ir al ERP
            </Link>
          )}
          <span className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-bold">
            {ctx.profile.first_name[0]}
            {ctx.profile.last_name[0]}
          </span>
          <form action={logoutAction}>
            <button aria-label="Cerrar sesión" className="grid size-9 place-items-center rounded-full bg-white/10">
              <LogOut size={17} />
            </button>
          </form>
        </div>
        {items.length > 1 && <SupplyNav items={items} />}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-5">{children}</main>
    </div>
  );
}
