import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

export async function executiveDashboardData() {
  const ctx = await requirePermission("reports.executive_dashboard.view");
  const store = await cookies();
  const selectedUnitId = store.get("oasis_unit")?.value;
  const unit =
    ctx.units.find((item) => item.id === selectedUnitId) ?? ctx.units[0];
  if (!unit)
    throw new Error("El usuario no tiene una unidad de negocio asignada");
  const company = ctx.companies.find((item) => item.id === unit.company_id);
  if (!company)
    throw new Error("La unidad no pertenece a una empresa autorizada");

  const supabase = await createSupabaseServerClient();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const monthFrom = `${today.slice(0, 8)}01`;
  const trendFrom = new Date(`${monthFrom}T12:00:00Z`);
  trendFrom.setUTCMonth(trendFrom.getUTCMonth() - 5);
  const trendStart = trendFrom.toISOString().slice(0, 10);

  const [summaryResult, trendResult, statusesResult] = await Promise.all([
    supabase.rpc("executive_payment_summary", {
      date_from: monthFrom,
      date_to: today,
      filter_company: company.id,
      filter_unit: unit.id,
    }),
    supabase.rpc("monthly_payment_trend", {
      date_from: trendStart,
      date_to: today,
      filter_company: company.id,
      filter_unit: unit.id,
    }),
    supabase.rpc("payment_status_summary", {
      date_from: monthFrom,
      date_to: today,
      filter_company: company.id,
      filter_unit: unit.id,
    }),
  ]);
  const commonError =
    summaryResult.error ?? trendResult.error ?? statusesResult.error;
  if (commonError)
    throw new Error(
      `No se pudo cargar el panel ejecutivo: ${commonError.message}`,
    );

  let operations: Record<string, number> = {};
  if (unit.code === "DA" && ctx.permissions.has("finance.distribution.view")) {
    const { data, error } = await supabase.rpc("dist_daily_summary", {
      target_unit: unit.id,
      target_date: today,
    });
    if (error)
      throw new Error(`No se pudo cargar Distribuidora: ${error.message}`);
    operations = (data ?? {}) as Record<string, number>;
  } else if (
    unit.code === "OM" &&
    ctx.permissions.has("inventory.materials.view")
  ) {
    const [
      { data: materials, error: materialsError },
      { data: outputs, error: outputsError },
    ] = await Promise.all([
      supabase
        .from("inventory_materials")
        .select("current_stock,average_price,status")
        .eq("business_unit_id", unit.id),
      supabase
        .from("inventory_outputs")
        .select("quantity,output_type")
        .eq("business_unit_id", unit.id)
        .eq("output_date", today),
    ]);
    if (materialsError ?? outputsError)
      throw new Error(
        `No se pudo cargar Inventario: ${(materialsError ?? outputsError)?.message}`,
      );
    operations = {
      materials: materials?.length ?? 0,
      stock_units: (materials ?? []).reduce(
        (sum, item) => sum + Number(item.current_stock),
        0,
      ),
      stock_value: (materials ?? []).reduce(
        (sum, item) =>
          sum + Number(item.current_stock) * Number(item.average_price),
        0,
      ),
      outputs_today: (outputs ?? []).reduce(
        (sum, item) => sum + Number(item.quantity),
        0,
      ),
    };
  } else if (
    ["HOC", "HOB", "HU"].includes(unit.code) &&
    ctx.permissions.has("lodging.reservations.view")
  ) {
    const [
      { data: rooms, error: roomsError },
      { data: reservations, error: reservationsError },
    ] = await Promise.all([
      supabase
        .from("lodging_rooms")
        .select("status")
        .eq("business_unit_id", unit.id)
        .eq("active", true),
      supabase
        .from("lodging_reservations")
        .select("status,total_value,check_in,check_out")
        .eq("business_unit_id", unit.id)
        .lte("check_in", today)
        .gt("check_out", today)
        .neq("status", "cancelled"),
    ]);
    if (roomsError ?? reservationsError)
      throw new Error(
        `No se pudo cargar Reservas: ${(roomsError ?? reservationsError)?.message}`,
      );
    operations = {
      rooms: rooms?.length ?? 0,
      occupied: reservations?.length ?? 0,
      available: Math.max(
        0,
        (rooms?.length ?? 0) - (reservations?.length ?? 0),
      ),
      occupancy: rooms?.length
        ? Math.round(((reservations?.length ?? 0) / rooms.length) * 100)
        : 0,
      active_value: (reservations ?? []).reduce(
        (sum, item) => sum + Number(item.total_value),
        0,
      ),
    };
  }

  return {
    ctx,
    unit,
    company,
    today,
    monthFrom,
    summary: (summaryResult.data?.[0] ?? {}) as Record<string, number>,
    trend: (trendResult.data ?? []) as Array<Record<string, number | string>>,
    statuses: (statusesResult.data ?? []) as Array<
      Record<string, number | string>
    >,
    operations,
  };
}
