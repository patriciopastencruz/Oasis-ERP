import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays } from "../domain/daily-closing";
import { closingDeadline } from "../domain/reception-bonus";
import {
  DEFAULT_SUPPORT_GOALS,
  isWeekday,
  supportShiftDay,
  supportClosingShiftDay,
  computeSupportBonus,
  countShiftReservations,
  monthlyGoal,
  weekdaysInMonth,
  type SupportGoals,
  type SupportHostalInput,
} from "../domain/support-bonus";
import type { UnitBonus } from "./bonus-queries";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type SupportConfig = {
  pool: number;
  userId: string | null;
  goals: SupportGoals;
  configured: boolean;
};

const num = (v: unknown, fallback: number) => (v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v));

function parseGoals(raw: unknown): SupportGoals {
  const g = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return {
    HOC: { per_month: num(g.HOC?.per_month, DEFAULT_SUPPORT_GOALS.HOC.per_month) },
    HU: { per_month: num(g.HU?.per_month, DEFAULT_SUPPORT_GOALS.HU.per_month) },
    HOB: { per_month: num(g.HOB?.per_month, DEFAULT_SUPPORT_GOALS.HOB.per_month) },
  };
}

/**
 * Bono de apoyo transversal del mes: el resultado de recepción de Centro medido solo con sus sábados y
 * domingos (los mismos 6 indicadores) y la gestión de la persona de apoyo dentro de su horario
 * (lunes a viernes 19:00-24:00, sábado y domingo 09:00-19:00): reservas, cierres y pagos.
 */
export async function loadSupportBonus(supabase: Supabase, bonuses: UnitBonus[], month: string) {
  if (!bonuses.length) return null;
  const first = bonuses[0];
  const start = first.monthStart;
  const reference = first.reference;

  const [configRes, savedRes, personRes] = await Promise.all([
    supabase.from("lodging_support_bonus_config").select("pool_amount,support_user_id,goals").limit(1).maybeSingle(),
    supabase
      .from("lodging_support_bonus_results")
      .select("points,amount,pool_amount,saved_at")
      .eq("month", start)
      .limit(1)
      .maybeSingle(),
    supabase.rpc("lodging_support_person"),
  ]);
  if (configRes.error) throw configRes.error;

  const c = configRes.data;
  const config: SupportConfig = c
    ? { pool: Number(c.pool_amount), userId: c.support_user_id, goals: parseGoals(c.goals), configured: true }
    : { pool: 0, userId: null, goals: DEFAULT_SUPPORT_GOALS, configured: false };
  const person = Array.isArray(personRes.data) ? (personRes.data[0] as { id: string; name: string } | undefined) : undefined;

  let counts = new Map<string, number>();
  let reservationsError = false;
  let closings: { expected: number; issued: number; onTime: number } | null = null;
  let payments: { total: number; withReceipt: number; withDifference: number } | null = null;
  if (config.userId) {
    const unitIds = bonuses.map((b) => b.unit.id);
    const [closingsRes, paymentsRes] = await Promise.all([
      supabase
        .from("lodging_daily_closings")
        .select("closing_date,issued_at")
        .in("business_unit_id", unitIds)
        .eq("issued_by", config.userId)
        .eq("status", "issued")
        .gte("closing_date", start)
        .lte("closing_date", reference),
      supabase
        .from("lodging_reservation_payments")
        .select("created_at,type,lodging_payment_receipts(deleted_at,ai_review_status)")
        .in("business_unit_id", unitIds)
        .eq("registered_by", config.userId)
        .eq("status", "confirmed")
        .in("payment_method", ["transfer", "card"])
        .gte("created_at", `${addDays(start, -1)}T00:00:00Z`)
        .lt("created_at", `${addDays(reference, 3)}T00:00:00Z`)
        .limit(5000),
    ]);
    if (!closingsRes.error) {
      // Los cierres de días de lunes a viernes que ella emitió (o reemitió) dentro de su horario (hasta la 01:00 de la madrugada siguiente); debe hacer uno por hostal por día laborable.
      const list = (closingsRes.data ?? []).filter((c) => isWeekday(c.closing_date) && c.issued_at && supportClosingShiftDay(c.issued_at) !== null);
      closings = {
        expected: unitIds.length * weekdaysInMonth(month),
        issued: list.length,
        onTime: list.filter((c) => c.issued_at && new Date(c.issued_at).getTime() < closingDeadline(c.closing_date).getTime()).length,
      };
    }
    if (!paymentsRes.error) {
      const night = (paymentsRes.data ?? []).filter((p) => {
        const day = supportShiftDay(p.created_at);
        return p.type !== "refund" && day !== null && day >= start && day <= reference;
      });
      const receiptsOf = (p: (typeof night)[number]) =>
        (Array.isArray(p.lodging_payment_receipts) ? p.lodging_payment_receipts : p.lodging_payment_receipts ? [p.lodging_payment_receipts] : []).filter((r) => !r.deleted_at);
      payments = {
        total: night.length,
        withReceipt: night.filter((p) => receiptsOf(p).length > 0).length,
        withDifference: night.filter((p) => receiptsOf(p).some((r) => r.ai_review_status === "mismatch")).length,
      };
    }

    const { data, error } = await supabase
      .from("lodging_reservations")
      .select("created_at,business_unit_id")
      .in("business_unit_id", bonuses.map((b) => b.unit.id))
      .eq("created_by", config.userId)
      .not("status", "in", "(cancelled,conflict)")
      .neq("origin", "maintenance")
      .gt("total_value", 0)
      // Margen para las noches que cruzan el cambio de mes; el filtro exacto es por noche de trabajo.
      .gte("created_at", `${addDays(start, -1)}T00:00:00Z`)
      .lt("created_at", `${addDays(reference, 3)}T00:00:00Z`)
      .limit(5000);
    if (error) reservationsError = true;
    else counts = countShiftReservations(data ?? [], start, reference);
  }

  const weekdays = weekdaysInMonth(month);
  const hostales: SupportHostalInput[] = bonuses.map((b) => {
    // El hostal de referencia se mide solo con sus sábados y domingos.
    const scope = b.weekend ?? b;
    return {
      code: b.unit.code,
      name: b.unit.name,
      pool: b.config.pool,
      missed: scope.result.missedCount,
      // Lo que realmente se paga a la recepción (con la reducción por orden si corresponde) sobre su máximo.
      points: b.config.pool > 0 ? (scope.result.amount / b.config.pool) * 100 : scope.result.points,
      created: counts.get(b.unit.id) ?? 0,
      goal: monthlyGoal(b.unit.code, config.goals),
    };
  });
  const result = computeSupportBonus({ pool: config.pool, hostales, closings, payments });
  const saved = savedRes.data
    ? {
        points: Number(savedRes.data.points),
        amount: Number(savedRes.data.amount),
        poolAmount: Number(savedRes.data.pool_amount),
        savedAt: savedRes.data.saved_at,
      }
    : null;
  return {
    month,
    monthStart: start,
    provisional: first.provisional,
    config,
    personName: person?.name ?? null,
    weekdays,
    hostales,
    closings,
    payments,
    result,
    saved,
    reservationsError,
  };
}

export type SupportBonus = NonNullable<Awaited<ReturnType<typeof loadSupportBonus>>>;
