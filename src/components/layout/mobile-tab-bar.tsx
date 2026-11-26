"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardCheck, House, Menu } from "lucide-react";
import { MOBILE_NAV_ID } from "@/components/layout/shell-root";

type Tab = { href: string; label: string; icon: "home" | "approve" | "bell" };
const ICONS = { home: House, approve: ClipboardCheck, bell: Bell };

/** Barra inferior del celular: accesos directos y el botón que abre el menú completo. */
export function MobileTabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname() ?? "";
  const base = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold";
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(8,43,89,.08)] md:hidden"
    >
      {tabs.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? "text-[var(--oasis-primary)]" : "text-slate-500"}`}
          >
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
      <label htmlFor={MOBILE_NAV_ID} role="button" className={`${base} cursor-pointer text-slate-500`}>
        <Menu size={22} />
        Menú
      </label>
    </nav>
  );
}
