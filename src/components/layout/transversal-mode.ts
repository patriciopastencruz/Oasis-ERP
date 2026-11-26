"use client";

import { usePathname } from "next/navigation";

const TRANSVERSAL_PREFIXES = ["/inicio", "/dashboard", "/suppliers", "/tasks"];

export function useIsTransversalRoute() {
  const pathname = usePathname();
  return TRANSVERSAL_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
}
