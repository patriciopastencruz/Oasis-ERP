"use server";

import { z } from "zod";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import { calendarReservations } from "./queries";

const MAX_RANGE_DAYS = 120;
const input = z.object({
  unitId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Reservas de otro tramo de fechas del calendario, para recorrer semanas ya pasadas o lejanas sin cargarlo todo al abrir. */
export async function loadCalendarRangeAction(unitId: string, from: string, to: string) {
  const parsed = input.safeParse({ unitId, from, to });
  if (!parsed.success) return { ok: false as const, message: "Rango inválido." };
  const ctx = await requireSession();
  const allowed = ["lodging.reservations.view", "kpis.view"].some((p) => ctx.permissions.has(p));
  const unit = ctx.units.find((u) => u.id === parsed.data.unitId && lodgingUnitCodes.includes(u.code));
  if (!allowed || !unit) return { ok: false as const, message: "No tienes acceso a este hostal." };
  const days = (Date.parse(parsed.data.to) - Date.parse(parsed.data.from)) / 86_400_000;
  if (!(days > 0 && days <= MAX_RANGE_DAYS)) return { ok: false as const, message: "Rango inválido." };
  const { data, error } = await calendarReservations(await createSupabaseServerClient(), unit.id, parsed.data.from, parsed.data.to);
  if (error) return { ok: false as const, message: "No fue posible cargar esas fechas." };
  return { ok: true as const, reservations: data ?? [] };
}
