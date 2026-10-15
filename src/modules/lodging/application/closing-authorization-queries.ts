import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ClosingAuthorization = {
  id: string;
  business_unit_id: string;
  closing_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at: string | null;
  decision_notes: string | null;
  expires_at: string | null;
  requester: { first_name: string | null; last_name: string | null } | null;
  decider: { first_name: string | null; last_name: string | null } | null;
};

const SELECT =
  "id,business_unit_id,closing_date,reason,status,requested_at,decided_at,decision_notes,expires_at,requester:profiles!lodging_closing_authorizations_requested_by_fkey(first_name,last_name),decider:profiles!lodging_closing_authorizations_decided_by_fkey(first_name,last_name)";

const normalize = (rows: unknown[]) =>
  rows.map((r) => {
    const row = r as Record<string, unknown>;
    const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
    return { ...row, requester: one(row.requester), decider: one(row.decider) } as ClosingAuthorization;
  });

/** Última solicitud de autorización para cerrar esa fecha en el hostal. */
export async function latestClosingAuthorization(supabase: Supabase, unitId: string, date: string) {
  const { data, error } = await supabase
    .from("lodging_closing_authorizations")
    .select(SELECT)
    .eq("business_unit_id", unitId)
    .eq("closing_date", date)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return normalize(data ?? [])[0] ?? null;
}

export function isAuthorizationActive(a: ClosingAuthorization | null, now = new Date()) {
  return !!a && a.status === "approved" && !!a.expires_at && new Date(a.expires_at) > now;
}

export async function listClosingAuthorizations(supabase: Supabase, unitIds: string[]) {
  if (!unitIds.length) return [];
  const { data, error } = await supabase
    .from("lodging_closing_authorizations")
    .select(SELECT)
    .in("business_unit_id", unitIds)
    .order("requested_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return normalize(data ?? []);
}
