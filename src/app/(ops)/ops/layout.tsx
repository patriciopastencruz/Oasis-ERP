import type { Metadata, Viewport } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { opsContext } from "@/modules/lodging/application/ops-queries";
import { selectOpsUnitAction } from "@/modules/lodging/application/ops-actions";

export const metadata: Metadata = {
  title: "Oasis Operaciones",
  description: "Portal operativo de los hostales Oasis.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Oasis Ops", statusBarStyle: "default" },
  icons: { icon: "/ops-icon-192.png", apple: "/ops-icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#0b2f5f", width: "device-width", initialScale: 1 };

const shortName = (name: string) => name.replace(/^Hostal\s+(Oasis\s+)?/i, "");

/** Portal operativo único: la misma URL se adapta a los permisos y hostales del usuario. */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const { ctx, units, unit } = await opsContext();
  return (
    <div className="min-h-screen bg-[#f3f6fa] text-[#16202c]">
      <header className="sticky top-0 z-20 bg-[#0b2f5f] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white shadow">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9fb8d9]">Oasis Operaciones</p>
            <p className="truncate text-lg font-bold">{unit.name}</p>
          </div>
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
        {units.length > 1 && (
          <nav className="mx-auto mt-3 flex max-w-xl gap-2 overflow-x-auto" aria-label="Cambiar hostal">
            {units.map((u) => (
              <form key={u.id} action={selectOpsUnitAction}>
                <input type="hidden" name="unit_id" value={u.id} />
                <button
                  className={`h-9 whitespace-nowrap rounded-full px-4 text-sm font-semibold ${
                    u.id === unit.id ? "bg-white text-[#0b2f5f]" : "bg-white/10 text-white"
                  }`}
                  aria-current={u.id === unit.id ? "true" : undefined}
                >
                  {shortName(u.name)}
                </button>
              </form>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-xl px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">{children}</main>
    </div>
  );
}
