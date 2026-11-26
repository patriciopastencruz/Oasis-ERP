"use client";

import { usePathname } from "next/navigation";

export function useIsAdminGeneral() {
  const pathname = usePathname();
  // El resumen ejecutivo (/inicio) vive en Administración General.
  return (pathname?.startsWith("/admin") || pathname?.startsWith("/inicio")) ?? false;
}
