import { PageHeader, ComingSoon } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function Finance() {
  await requirePermission("finance.payment_requests.view_unit");
  return (
    <>
      <PageHeader
        title="Finanzas"
        description="Centro de navegación del dominio financiero."
      />
      <ComingSoon name="Módulo Finanzas" />
    </>
  );
}
