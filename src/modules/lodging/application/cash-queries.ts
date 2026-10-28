import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildCashReport, cashMonthRange, type CashPaymentRow } from "../domain/cash-report";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Efectivo cobrado por un hostal en un mes: cada pago con quién lo registró, para revisar o cuadrar la caja. */
export async function loadCashReport(supabase: Supabase, unitId: string, month: string) {
  const { from, toExclusive } = cashMonthRange(month);
  const base = () =>
    supabase
      .from("lodging_reservation_payments")
      .select("id,paid_at,type,amount,notes,registered_by,lodging_reservations(origin,lodging_rooms(name),lodging_guests(full_name))")
      .eq("business_unit_id", unitId)
      .eq("payment_method", "cash")
      // Margen por la diferencia horaria; el filtro exacto es por fecha de Santiago.
      .gte("paid_at", `${from}T00:00:00-06:00`)
      .lt("paid_at", `${toExclusive}T06:00:00Z`);
  const [confirmed, voided] = await Promise.all([base().eq("status", "confirmed"), base().eq("status", "voided")]);
  if (confirmed.error) throw confirmed.error;
  if (voided.error) throw voided.error;

  const ids = [...new Set((confirmed.data ?? []).map((p) => p.registered_by).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
    for (const p of data ?? []) names.set(p.id, `${p.first_name} ${p.last_name}`.trim());
  }

  const rows: CashPaymentRow[] = (confirmed.data ?? []).map((p) => {
    const reservation = one(p.lodging_reservations as unknown as RelatedReservation | RelatedReservation[] | null);
    return {
      id: p.id,
      paid_at: p.paid_at,
      type: p.type,
      amount: Number(p.amount),
      notes: p.notes,
      room: one(reservation?.lodging_rooms)?.name ?? null,
      guest: one(reservation?.lodging_guests)?.full_name ?? null,
      origin: reservation?.origin ?? null,
      registered_by: names.get(p.registered_by) ?? null,
    };
  });
  return buildCashReport(month, rows, (voided.data ?? []).map((p) => ({ amount: Number(p.amount) })));
}

type RelatedReservation = {
  origin: string | null;
  lodging_rooms: { name: string } | { name: string }[] | null;
  lodging_guests: { full_name: string | null } | { full_name: string | null }[] | null;
};
