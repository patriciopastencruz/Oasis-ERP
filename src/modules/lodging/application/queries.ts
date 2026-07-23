import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

const LODGING_UNIT_CODES = ["HU", "HOC"];

export async function lodgingContext(permission = "lodging.reservations.view") {
  const ctx = await requirePermission(permission);
  const store = await cookies();
  const selected = store.get("oasis_unit")?.value;
  const unit =
    ctx.units.find(
      (u) => u.id === selected && LODGING_UNIT_CODES.includes(u.code),
    ) ?? ctx.units.find((u) => LODGING_UNIT_CODES.includes(u.code));
  if (!unit) redirect("/no-access");
  const company = ctx.companies.find((c) => c.id === unit.company_id);
  if (!company) redirect("/no-access");
  return { ctx, unit, company, supabase: await createSupabaseServerClient() };
}

export async function calendarData(from: string, to: string) {
  const { unit, supabase } = await lodgingContext();
  const [{ data: rooms }, { data: reservations }, { data: configs }] =
    await Promise.all([
      supabase
        .from("lodging_rooms")
        .select("*")
        .eq("business_unit_id", unit.id)
        .eq("active", true)
        .order("display_order"),
      supabase
        .from("lodging_reservations")
        .select("*,lodging_guests(full_name,phone)")
        .eq("business_unit_id", unit.id)
        .lt("check_in", to)
        .gt("check_out", from)
        .neq("status", "cancelled")
        .order("check_in"),
      supabase
        .from("lodging_ical_configs")
        .select("last_sync_at")
        .eq("business_unit_id", unit.id)
        .order("last_sync_at", { ascending: false })
        .limit(1),
    ]);
  return {
    unit,
    rooms: rooms ?? [],
    reservations: reservations ?? [],
    lastSync: configs?.[0]?.last_sync_at ?? null,
  };
}

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-04:00`));
