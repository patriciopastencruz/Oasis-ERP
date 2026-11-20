"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas del portal de abastecimiento; la activa se marca según la ruta. */
export function SupplyNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/supply" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="mx-auto mt-3 flex max-w-3xl gap-2 overflow-x-auto pb-0.5" aria-label="Abastecimiento">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(item.href) ? "page" : undefined}
          className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold leading-9 ${
            active(item.href) ? "bg-white text-[#0b2f5f]" : "bg-white/10 text-white"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
