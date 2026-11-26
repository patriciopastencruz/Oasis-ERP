"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useIsAdminGeneral } from "@/components/layout/admin-mode";
import { useIsTransversalRoute } from "@/components/layout/transversal-mode";

const GENERIC_THEME = {
  "--oasis-page": "#f2f6fb",
  "--oasis-sidebar": "#082b59",
  "--oasis-primary": "#0b4f9c",
  "--oasis-primary-dark": "#083f7d",
  "--oasis-accent": "#0b4f9c",
  "--oasis-soft": "#edf4fc",
  "--oasis-border": "#b8cde6",
  "--oasis-avatar": "#dbe9f8",
} as CSSProperties;

/** Id del interruptor que abre el menú lateral en el celular (lo usan el botón de la barra y el fondo). */
export const MOBILE_NAV_ID = "erp-mobile-nav";

export function ShellRoot({
  theme,
  children,
}: {
  theme: CSSProperties;
  children: ReactNode;
}) {
  const inAdminGeneral = useIsAdminGeneral();
  const inTransversalRoute = useIsTransversalRoute();
  const pathname = usePathname();
  const toggle = useRef<HTMLInputElement>(null);
  // Al navegar desde el menú del celular, se cierra solo.
  useEffect(() => {
    if (toggle.current) toggle.current.checked = false;
  }, [pathname]);
  return (
    <div
      style={inAdminGeneral || inTransversalRoute ? GENERIC_THEME : theme}
      className="erp-shell min-h-screen bg-[var(--oasis-page)] text-[#151d27] md:grid md:grid-cols-[232px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]"
    >
      <input
        ref={toggle}
        id={MOBILE_NAV_ID}
        type="checkbox"
        aria-hidden
        tabIndex={-1}
        className="peer sr-only"
      />
      <label
        htmlFor={MOBILE_NAV_ID}
        aria-hidden
        className="fixed inset-0 z-40 hidden bg-black/45 peer-checked:block md:hidden!"
      />
      {children}
    </div>
  );
}
