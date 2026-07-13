import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getSessionContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id,first_name,last_name,email,phone,job_title,active,last_sign_in_at,roles(id,key,name)",
    )
    .eq("id", user.id)
    .single();
  if (!profile?.active) return null;
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  const { data: rp } = await supabase
    .from("role_permissions")
    .select("permissions(key,module)")
    .eq("role_id", role?.id ?? "");
  const permissions = new Set(
    (rp ?? [])
      .map((row) => {
        const p = Array.isArray(row.permissions)
          ? row.permissions[0]
          : row.permissions;
        return p?.key;
      })
      .filter(Boolean),
  );
  const { data: companies } = await supabase
    .from("user_companies")
    .select("companies(id,code,trade_name)")
    .eq("user_id", user.id);
  const { data: units } = await supabase
    .from("user_business_units")
    .select("business_units(id,code,name,company_id)")
    .eq("user_id", user.id);
  return {
    user,
    profile,
    role,
    permissions,
    companies: (companies ?? []).flatMap((x) => x.companies ?? []),
    units: (units ?? []).flatMap((x) => x.business_units ?? []),
  };
});
export async function requireSession() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}
export async function requirePermission(permission: string) {
  const ctx = await requireSession();
  if (!ctx.permissions.has(permission)) redirect("/no-access");
  return ctx;
}
