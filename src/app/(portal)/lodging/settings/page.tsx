import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext } from "@/modules/lodging/application/queries";
export default async function Page() {
  const { ctx, unit } = await lodgingContext();
  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Configuración"
        description="Opciones operativas del módulo de Gestión de reservas."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/lodging/rooms">
          <Panel>
            <h2 className="font-semibold">Habitaciones y tarifas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Capacidad, estado, orden y tarifa directa.
            </p>
          </Panel>
        </Link>
        <Link href="/lodging/ical">
          <Panel>
            <h2 className="font-semibold">Calendarios iCal</h2>
            <p className="mt-2 text-sm text-slate-500">
              Importación Booking/Airbnb y enlaces Oasis.
            </p>
          </Panel>
        </Link>
        <Panel>
          <h2 className="font-semibold">Permisos actuales</h2>
          <p className="mt-2 text-sm text-slate-500">
            {ctx.role?.name}. Los permisos se administran desde Administración →
            Roles.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Región</h2>
          <p className="mt-2 text-sm text-slate-500">
            Español · America/Santiago · CLP · fechas DD-MM-YYYY.
          </p>
        </Panel>
      </div>
    </>
  );
}
