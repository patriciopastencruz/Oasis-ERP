"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
const schema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().uuid(),
  rut: z.string().trim().min(8),
  legal_name: z.string().trim().min(2).max(180),
  trade_name: z.string().trim().max(180).optional(),
  business_activity: z.string().trim().max(250).optional(),
  email: z.union([z.string().email(), z.literal("")]),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
});
function fail(m: string): never {
  redirect(`/suppliers?error=${encodeURIComponent(m)}`);
}
export async function saveSupplierAction(form: FormData) {
  const ctx = await requirePermission("finance.suppliers.manage"),
    v = schema.safeParse(Object.fromEntries(form));
  if (!v.success) fail(v.error.issues[0].message);
  if (!ctx.companies.some((x) => x.id === v.data.company_id))
    fail("Empresa no autorizada");
  const s = await createSupabaseServerClient(),
    payload = {
      company_id: v.data.company_id,
      rut: v.data.rut,
      legal_name: v.data.legal_name,
      trade_name: v.data.trade_name || null,
      business_activity: v.data.business_activity || null,
      email: v.data.email || null,
      phone: v.data.phone || null,
      address: v.data.address || null,
    };
  const result = v.data.id
    ? await s.from("suppliers").update(payload).eq("id", v.data.id)
    : await s.from("suppliers").insert({ ...payload, created_by: ctx.user.id });
  if (result.error)
    fail(
      result.error.code === "23505"
        ? "Ya existe un proveedor con ese RUT en la empresa."
        : "No fue posible guardar el proveedor.",
    );
  revalidatePath("/finance/payment-control/suppliers");
  revalidatePath("/suppliers");
  redirect("/suppliers?success=Proveedor guardado");
}
export async function toggleSupplierAction(form: FormData) {
  await requirePermission("finance.suppliers.manage");
  const s = await createSupabaseServerClient(),
    id = z.string().uuid().parse(form.get("id")),
    active = form.get("active") === "true";
  await s.from("suppliers").update({ active }).eq("id", id);
  revalidatePath("/finance/payment-control/suppliers");
  revalidatePath("/suppliers");
}
