import type { CSSProperties } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { requireSession } from "@/modules/platform/auth/application/session";

// Mismos colores que el ERP (app-shell), que estas páginas no cargan.
const theme = {
  "--oasis-page": "#f2f6fb",
  "--oasis-primary": "#0b4f9c",
  "--oasis-primary-dark": "#083f7d",
  "--oasis-accent": "#0b4f9c",
  "--oasis-soft": "#edf4fc",
  "--oasis-border": "#b8cde6",
} as CSSProperties;

// Páginas de una sola tarea para el equipo: piden sesión del ERP pero no
// muestran sus paneles ni menús (se comparten como link aislado).
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen bg-[var(--oasis-page)]" style={theme}>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <div className="mb-2 flex justify-end">
          <form action={logoutAction}>
            <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white">
              <LogOut size={14} /> Cerrar sesión
            </button>
          </form>
        </div>
        {children}
      </main>
    </div>
  );
}
