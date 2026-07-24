import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
const cards = [
  ["/admin/users", "Usuarios"],
  ["/admin/roles", "Roles y permisos"],
  ["/admin/workflows", "Flujos de aprobación"],
  ["/admin/business-units", "Unidades de negocio"],
];
export default async function Admin() {
  await requirePermission("administration.users.manage");
  return (
    <>
      <PageHeader
        title="Administración"
        description="Configuración segura del núcleo de OASIS ERP."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([href, label]) => (
          <Link href={href} key={href}>
            <Panel className="transition hover:-translate-y-0.5">
              <b>{label}</b>
              <p className="mt-2 text-sm text-[#63778e]">Abrir configuración</p>
            </Panel>
          </Link>
        ))}
      </div>
    </>
  );
}
