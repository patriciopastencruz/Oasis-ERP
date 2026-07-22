"use client";

import type { ReactNode } from "react";
import { useIsAdminGeneral } from "@/components/layout/admin-mode";

export function ShowOnlyInAdminGeneral({ children }: { children: ReactNode }) {
  const inAdminGeneral = useIsAdminGeneral();
  if (!inAdminGeneral) return null;
  return <>{children}</>;
}
