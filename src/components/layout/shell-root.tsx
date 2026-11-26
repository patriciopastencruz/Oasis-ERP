"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MENU_COOKIE, MOBILE_NAV_ID } from "@/components/layout/menu-constants";
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

const DesktopMenuContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });
export const useDesktopMenu = () => useContext(DesktopMenuContext);

export function ShellRoot({
  theme,
  menuHidden = false,
  children,
}: {
  theme: CSSProperties;
  menuHidden?: boolean;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(menuHidden);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    document.cookie = `${MENU_COOKIE}=${next ? "hidden" : "shown"}; path=/; max-age=31536000; samesite=lax`;
  };
  const inAdminGeneral = useIsAdminGeneral();
  const inTransversalRoute = useIsTransversalRoute();
  const pathname = usePathname();
  const navToggle = useRef<HTMLInputElement>(null);
  // Al navegar desde el menú del celular, se cierra solo.
  useEffect(() => {
    if (navToggle.current) navToggle.current.checked = false;
  }, [pathname]);
  return (
    <DesktopMenuContext.Provider value={{ hidden, toggle }}>
    <div
      data-menu={hidden ? "hidden" : "shown"}
      style={inAdminGeneral || inTransversalRoute ? GENERIC_THEME : theme}
      className="erp-shell min-h-screen bg-[var(--oasis-page)] text-[#151d27] md:grid md:grid-cols-[232px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]"
    >
      <input
        ref={navToggle}
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
    </DesktopMenuContext.Provider>
  );
}
