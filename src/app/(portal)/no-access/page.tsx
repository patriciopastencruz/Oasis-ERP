import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
export default function NoAccess() {
  return (
    <>
      <PageHeader
        title="Acceso no autorizado"
        description="Tu cuenta no posee el permiso necesario para esta sección."
      />
      <Panel>
        <Link className="font-semibold text-[#0b4f9c]" href="/">
          Volver al inicio
        </Link>
      </Panel>
    </>
  );
}
