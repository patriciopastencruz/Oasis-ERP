"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
const schema = z.object({
  id: z.string().uuid().optional(),
  company_id: z.string().uuid(),
  business_unit_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, "Código inválido"),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
});
type Catalog = "expense_categories" | "cost_centers";
const config = {
  expense_categories: {
    permission: "finance.expense_categories.manage",
    legacy: "administration.categories.manage",
    path: "/finance/payment-control/categories",
    label: "categoría",
  },
  cost_centers: {
    permission: "finance.cost_centers.manage",
    legacy: "administration.cost_centers.manage",
    path: "/finance/payment-control/cost-centers",
    label: "centro de costo",
  },
} as const;
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
async function authorize(table: Catalog) {
  const ctx = await requireSession();
  const c = config[table];
  if (!ctx.permissions.has(c.permission) && !ctx.permissions.has(c.legacy))
    redirect("/no-access");
  return ctx;
}
export async function saveCatalogAction(table: Catalog, form: FormData) {
  const c = config[table];
  const ctx = await authorize(table);
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(c.path, parsed.error.issues[0].message);
  const v = parsed.data;
  if (!ctx.companies.some((x) => x.id === v.company_id))
    fail(c.path, "Empresa no autorizada");
  if (
    v.business_unit_id &&
    !ctx.units.some(
      (x) => x.id === v.business_unit_id && x.company_id === v.company_id,
    )
  )
    fail(c.path, "La unidad no pertenece a la empresa o no está autorizada");
  const s = await createSupabaseServerClient();
  const payload = {
    company_id: v.company_id,
    business_unit_id: v.business_unit_id || null,
    code: v.code,
    name: v.name,
    description: v.description || null,
  };
  const result = v.id
    ? await s.from(table).update(payload).eq("id", v.id)
    : await s.from(table).insert({ ...payload, created_by: ctx.user.id });
  if (result.error) {
    if (result.error.code === "23505")
      fail(
        c.path,
        `Ya existe una ${c.label} con ese código en el mismo alcance`,
      );
    fail(c.path, "No fue posible guardar. Revisa los datos y permisos.");
  }
  revalidatePath(c.path);
  revalidatePath("/finance/payment-control/new");
  redirect(`${c.path}?success=Registro guardado`);
}
export async function toggleCatalogAction(table: Catalog, form: FormData) {
  const c = config[table];
  await authorize(table);
  const id = z.string().uuid().parse(form.get("id"));
  const active = form.get("active") === "true";
  const s = await createSupabaseServerClient();
  const { error } = await s.from(table).update({ active }).eq("id", id);
  if (error) fail(c.path, "No fue posible cambiar el estado");
  revalidatePath(c.path);
  revalidatePath("/finance/payment-control/new");
  redirect(
    `${c.path}?success=${active ? "Registro activado" : "Registro desactivado"}`,
  );
}
export async function saveExpenseCategoryAction(form: FormData) {
  return saveCatalogAction("expense_categories", form);
}
export async function toggleExpenseCategoryAction(form: FormData) {
  return toggleCatalogAction("expense_categories", form);
}
export async function saveCostCenterAction(form: FormData) {
  return saveCatalogAction("cost_centers", form);
}
export async function toggleCostCenterAction(form: FormData) {
  return toggleCatalogAction("cost_centers", form);
}
