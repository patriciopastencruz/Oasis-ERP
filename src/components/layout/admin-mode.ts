"use client";

import { usePathname } from "next/navigation";

export function useIsAdminGeneral() {
  const pathname = usePathname();
  return pathname?.startsWith("/admin") ?? false;
}
