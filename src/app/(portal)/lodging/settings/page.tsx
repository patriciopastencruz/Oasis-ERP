import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { setHousekeepingAction } from "@/modules/lodging/application/actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext();
  const canConfigure = ctx.permissions.has("lodging.operations.configure");
  const { data: housekeepingFlag } = await supabase.rpc("lodging_ops_housekeeping_enabled", { target_unit: unit.id });
  const housekeepingOn = housekeepingFlag !== false;
  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Configuración"
        description="Opciones operativas del módulo de Gestión de reservas."
      />
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error || q.success}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="md:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <h2 className="font-semibold">Aseo e inspección en el portal operativo</h2>
              <p className="mt-1 text-sm text-slate-600">
                Estado en {unit.name}:{" "}
                <b className={housekeepingOn ? "text-emerald-700" : "text-amber-700"}>{housekeepingOn ? "Activado" : "Desactivado"}</b>.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {housekeepingOn
                  ? "Aseo marca comenzar y finalizar, recepción inspecciona y el check-in exige la habitación inspeccionada. Desactívalo si el hostal aún no usa el portal: el check-in no esperará la inspección y el check-out no dejará tareas de aseo."
                  : "El check-in no espera la inspección y el check-out no deja la habitación pendiente de aseo. Actívalo cuando el personal de aseo esté capacitado en el portal."}
              </p>
            </div>
            {canConfigure && (
              <form action={setHousekeepingAction}>
                <input type="hidden" name="unit_id" value={unit.id} />
                <input type="hidden" name="enabled" value={housekeepingOn ? "false" : "true"} />
                <ConfirmButton
                  message={
                    housekeepingOn
                      ? `¿Desactivar aseo e inspección en ${unit.name}? Las habitaciones pendientes de aseo o inspección quedarán disponibles.`
                      : `¿Activar aseo e inspección en ${unit.name}? Desde ahora el check-in exigirá la habitación inspeccionada.`
                  }
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${housekeepingOn ? "border border-slate-300 bg-white text-slate-800" : "bg-[#0b4f9c] text-white"}`}
                >
                  {housekeepingOn ? "Desactivar" : "Activar"}
                </ConfirmButton>
              </form>
            )}
          </div>
        </Panel>
        <Link href="/lodging/rooms">
          <Panel>
            <h2 className="font-semibold">Habitaciones y tarifas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Capacidad, estado, orden y tarifa directa.
            </p>
          </Panel>
        </Link>
        {ctx.permissions.has("lodging.ical.sync") && (
          <Link href="/lodging/ical">
            <Panel>
              <h2 className="font-semibold">Sincronización iCal</h2>
              <p className="mt-2 text-sm text-slate-500">
                Importación Booking/Airbnb, sincronizar ahora y enlaces de
                calendario por habitación.
              </p>
            </Panel>
          </Link>
        )}
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
