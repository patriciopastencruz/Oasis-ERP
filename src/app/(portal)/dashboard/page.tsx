import { PageHeader, ComingSoon } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function Dashboard() {
  await requirePermission("reports.executive_dashboard.view");
  return (
    <>
      <PageHeader
        title="Dashboard Ejecutivo"
        description="Acceso preparado según unidades de negocio y permisos."
      />
      <ComingSoon name="Indicadores ejecutivos" />
    </>
  );
}
