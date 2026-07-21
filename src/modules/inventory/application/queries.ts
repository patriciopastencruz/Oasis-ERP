import "server-only";
import { cookies } from "next/headers";
import { requirePermission } from "@/modules/platform/auth/application/session";

export async function inventoryContext(permission: string) {
  const ctx = await requirePermission(permission);
  const store = await cookies();
  const savedUnitId = store.get("oasis_unit")?.value;
  // Mismo criterio de selección por defecto que el layout (app-shell):
  // la unidad guardada, si no hay ninguna la de Oasis Modulares, y si el
  // usuario no tiene acceso a esa, la primera disponible.
  const unit =
    ctx.units.find((item) => item.id === savedUnitId) ??
    ctx.units.find((item) => item.code === "OM") ??
    ctx.units[0];
  return { ctx, unit };
}
