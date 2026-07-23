"use client";

import { usePathname } from "next/navigation";

const TRANSVERSAL_PREFIXES = ["/dashboard", "/suppliers"];

export function useIsTransversalRoute() {
  const pathname = usePathname();
  return TRANSVERSAL_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
}
