"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Volver a la pantalla anterior. La app instalada en el celular no tiene botón de atrás del navegador.
 * Si no hay historial (se abrió directo en esa pantalla) va a `fallback`. No aparece en las pantallas de inicio.
 */
export function BackButton({ fallback, hideOn = [], className = "" }: { fallback: string; hideOn?: string[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (hideOn.includes(pathname ?? "")) return null;
  return (
    <button
      type="button"
      aria-label="Volver"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={`grid size-10 shrink-0 place-items-center rounded-full border ${className}`}
    >
      <ArrowLeft size={19} />
    </button>
  );
}
