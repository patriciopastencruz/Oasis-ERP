"use client";

import { useIsAdminGeneral } from "@/components/layout/admin-mode";
import { GENERIC_NAME } from "@/components/layout/sidebar-brand";

export function TopBarTitle({
  unitName,
  companyName,
}: {
  unitName?: string;
  companyName?: string;
}) {
  const inAdminGeneral = useIsAdminGeneral();
  return <b>{inAdminGeneral ? GENERIC_NAME : (unitName ?? companyName)}</b>;
}
