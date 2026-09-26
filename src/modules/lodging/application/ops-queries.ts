import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { lodgingUnitCodes } from "@/config/business-units";
import type { OpsBoard } from "../domain/operations";

export const OPS_UNIT_COOKIE = "oasis_ops_unit";
const OPS_PERMISSIONS = ["lodging.housekeeping.view", "lodging.rooms.inspect", "lodging.operations.view"];

/**
 * Contexto del portal operativo. El acceso real lo validan las funciones de
 * base de datos con auth.uid(), user_business_units y permisos; aquí solo se
 * elige qué unidad mostrar entre las asignadas (nunca se confía en el cliente).
 */
export async function opsContext() {
  const ctx = await requireSession();
  if (!OPS_PERMISSIONS.some((p) => ctx.permissions.has(p))) redirect("/no-access");
  const units = ctx.units
    .filter((u) => lodgingUnitCodes.includes(u.code))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  if (!units.length) redirect("/no-access");
  const saved = (await cookies()).get(OPS_UNIT_COOKIE)?.value;
  const unit = units.find((u) => u.id === saved) ?? units[0];
  const can = {
    clean: ctx.permissions.has("lodging.housekeeping.execute"),
    inspect: ctx.permissions.has("lodging.rooms.inspect"),
    operations: ctx.permissions.has("lodging.operations.view"),
  };
  return { ctx, units, unit, can, supabase: await createSupabaseServerClient() };
}

/** Procesa salidas sin check-out y devuelve el tablero operacional de la unidad. */
export async function loadBoard(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, unitId: string) {
  const sync = await supabase.rpc("lodging_ops_sync_departures", { target_unit: unitId });
  if (sync.error) console.error("[ops] sync departures", sync.error.message);
  const { data, error } = await supabase.rpc("lodging_ops_board", { target_unit: unitId });
  if (error) throw error;
  return data as OpsBoard;
}
