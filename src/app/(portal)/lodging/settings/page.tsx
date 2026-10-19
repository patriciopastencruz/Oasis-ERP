import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { setHousekeepingAction } from "@/modules/lodging/application/actions";
import { saveReportGoalsAction } from "@/modules/lodging/application/goal-actions";
import { goalsFromRow, revparGoal } from "@/modules/lodging/domain/report-goals";
import { REVIEW_CATEGORIES } from "@/modules/lodging/domain/review-scores";
export default async function Page({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext();
  const canConfigure = ctx.permissions.has("lodging.operations.configure");
  const { data: housekeepingFlag } = await supabase.rpc("lodging_ops_housekeeping_enabled", { target_unit: unit.id });
  const housekeepingOn = housekeepingFlag !== false;
  const canSetGoals = ctx.permissions.has("lodging.goals.manage");
  const { data: goalsRow } = await supabase
    .from("lodging_report_goals")
    .select("occupancy_pct,average_rate,revpar,booking_score,booking_categories")
    .eq("business_unit_id", unit.id)
    .maybeSingle();
  const goals = goalsFromRow(goalsRow);
  const revpar = revparGoal(goals);
  const input = "mt-1 w-full rounded-lg border border-[#d9dfe6] px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500";
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
        <Panel className="md:col-span-2">
          <h2 className="font-semibold">Metas del reporte semanal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Metas de {unit.name}. En el PDF semanal se muestran en verde junto al valor actual, con un círculo verde si se cumplen y rojo si no. Deja un campo vacío para no fijar meta.
            {!canSetGoals && " Solo gerencia puede modificarlas."}
          </p>
          <form action={saveReportGoalsAction} className="mt-4">
            <input type="hidden" name="unit_id" value={unit.id} />
            <fieldset disabled={!canSetGoals} className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm font-medium">
                Ocupación del mes (%)
                <input name="occupancy_pct" type="number" min="0" max="100" step="1" defaultValue={goals.occupancyPct ?? ""} className={input} />
              </label>
              <label className="text-sm font-medium">
                Venta promedio por habitación ($)
                <input name="average_rate" type="number" min="0" step="500" defaultValue={goals.averageRate ?? ""} className={input} />
              </label>
              <label className="text-sm font-medium">
                RevPAR ($)
                <input name="revpar" type="number" min="0" step="500" defaultValue={goals.revpar ?? ""} className={input} />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {goals.revpar !== null
                    ? "Meta propia del hostal."
                    : `Vacío: venta × ocupación${revpar === null ? "" : ` = $${revpar.toLocaleString("es-CL")}`}.`}
                </span>
              </label>
              <label className="text-sm font-medium">
                Puntaje Booking
                <input name="booking_score" type="number" min="0" max="10" step="0.1" defaultValue={goals.bookingScore ?? ""} className={input} />
              </label>
              <div className="sm:col-span-4">
                <p className="text-sm font-medium">Puntaje Booking por área</p>
                <div className="mt-1 grid gap-3 sm:grid-cols-4">
                  {REVIEW_CATEGORIES.map(({ key, label }) => (
                    <label key={key} className="text-xs text-slate-600">
                      {label}
                      <input name={`cat_${key}`} type="number" min="0" max="10" step="0.1" defaultValue={goals.categories[key] ?? ""} className={input} />
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>
            {canSetGoals && (
              <button type="submit" className="mt-4 rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">
                Guardar metas
              </button>
            )}
          </form>
        </Panel>
        <Link href="/lodging/rooms">
          <Panel>
            <h2 className="font-semibold">Habitaciones y tarifas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Capacidad, estado, orden y tarifa directa.
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
