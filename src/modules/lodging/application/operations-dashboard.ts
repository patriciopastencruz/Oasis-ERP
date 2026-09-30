import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadBoards } from "./ops-queries";
import type { IncidentItem } from "../domain/incidents";
import type { OpsKpis } from "../domain/ops-kpis";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Datos de la vista ejecutiva de la operación: tablero de habitaciones,
 * indicadores del período e incidencias de cada hostal, en paralelo. La base
 * valida permiso y unidad en cada llamada; un hostal que falla no se muestra.
 */
export async function loadOperationsDashboard(supabase: Supabase, unitIds: string[], from: string, to: string) {
  const [boards, kpis, incidents] = await Promise.all([
    loadBoards(supabase, unitIds),
    Promise.all(
      unitIds.map(async (id) => {
        const { data, error } = await supabase.rpc("lodging_ops_kpis", { target_unit: id, from_date: from, to_date: to });
        if (error) console.error("[ops-kpis]", error.message);
        return error ? null : (data as OpsKpis);
      }),
    ),
    Promise.all(
      unitIds.map(async (id) => {
        const { data } = await supabase.rpc("lodging_incident_board", { target_unit: id });
        return ((data as IncidentItem[] | null) ?? []).map((i) => ({ ...i, unit_id: id }));
      }),
    ),
  ]);
  return { boards, kpis: kpis.filter((k): k is OpsKpis => k !== null), incidents: incidents.flat() };
}
