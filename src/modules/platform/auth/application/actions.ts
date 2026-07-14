"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loginAction(form: FormData) {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    redirect(
      `/login?error=${encodeURIComponent("Correo o contraseña incorrectos")}`,
    );
  redirect("/");
}
export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
export async function recoverPasswordAction(form: FormData) {
  const email = String(form.get("email") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/update-password`,
  });
  redirect("/forgot-password?sent=1");
}
export async function updatePasswordAction(form: FormData) {
  const password = String(form.get("password") ?? "");
  if (password.length < 8)
    redirect("/update-password?error=La contraseña debe tener 8 caracteres");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    redirect(`/update-password?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}
export async function updateProfileAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: String(form.get("first_name")),
      last_name: String(form.get("last_name")),
      phone: String(form.get("phone") ?? "") || null,
    })
    .eq("id", user.id);
  if (error)
    redirect(`/admin/profile?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/profile");
  redirect("/admin/profile?saved=1");
}

export async function setContextAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const companyId = String(form.get("company_id") ?? "");
  const unitId = String(form.get("unit_id") ?? "");
  let unitCode: string | null = null;
  const { data: company } = await supabase
    .from("user_companies")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!company) redirect("/no-access");
  if (unitId) {
    const { data: unit } = await supabase
      .from("user_business_units")
      .select("business_unit_id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .eq("business_unit_id", unitId)
      .maybeSingle();
    if (!unit) redirect("/no-access");
    const { data: businessUnit } = await supabase
      .from("business_units")
      .select("code")
      .eq("id", unitId)
      .eq("company_id", companyId)
      .maybeSingle();
    unitCode = businessUnit?.code ?? null;
  }
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
  store.set("oasis_company", companyId, options);
  store.set("oasis_unit", unitId, options);
  revalidatePath("/", "layout");
  if (unitCode === "DA") redirect("/finance/distribution");
  if (unitCode === "HU") redirect("/lodging");
  redirect("/dashboard");
}
export async function markOwnNotificationReadAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = String(form.get("id") ?? "");
  await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
export async function markAllOwnNotificationsReadAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("status", "unread");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
