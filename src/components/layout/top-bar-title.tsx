"use client";

import { useIsAdminGeneral } from "@/components/layout/admin-mode";
import { useIsTransversalRoute } from "@/components/layout/transversal-mode";
import { GENERIC_NAME } from "@/components/layout/sidebar-brand";

export function TopBarTitle({
  unitName,
  companyName,
}: {
  unitName?: string;
  companyName?: string;
}) {
  const inAdminGeneral = useIsAdminGeneral();
  const inTransversalRoute = useIsTransversalRoute();
  return (
    <b>
      {inAdminGeneral || inTransversalRoute
        ? GENERIC_NAME
        : (unitName ?? companyName)}
    </b>
  );
}
