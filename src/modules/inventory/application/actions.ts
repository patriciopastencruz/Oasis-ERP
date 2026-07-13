"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

const uuid = z.string().uuid();
const text = z.string().trim().min(1);

function go(path: string, key: "success" | "error", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}
function extension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "bin";
}
async function upload(
  file: File,
  bucket: string,
  company: string,
  entity: string,
) {
  if (!file.size) return null;
  const allowed =
    bucket === "inventory-material-images"
      ? ["image/jpeg", "image/png"]
      : ["application/pdf", "image/jpeg", "image/png"];
  const limit = bucket === "inventory-material-images" ? 5_242_880 : 10_485_760;
  if (!allowed.includes(file.type) || file.size > limit)
    throw new Error("Archivo inválido");
  const path = `${company}/${entity}/${crypto.randomUUID()}.${extension(file)}`;
  const s = await createSupabaseServerClient();
  const { error } = await s.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return { path, name: file.name, mime: file.type, size: file.size };
}

export async function createMaterialAction(form: FormData) {
  const ctx = await requirePermission("inventory.materials.create");
  const parsed = z
    .object({
      company_id: uuid,
      business_unit_id: uuid,
      name: text.max(180),
      description: z.string().trim().max(500),
      category: text.max(100),
      unit_of_measure: text.max(40),
      standard_price: z.coerce.number().min(0),
      initial_stock: z.coerce.number().min(0),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go("/inventory/materials/new", "error", parsed.error.issues[0].message);
  if (
    !ctx.units.some(
      (x) =>
        x.id === parsed.data.business_unit_id &&
        x.company_id === parsed.data.company_id,
    )
  )
    go("/inventory/materials/new", "error", "La unidad no está autorizada.");
  const entity = crypto.randomUUID();
  let createdId = "";
  try {
    const image =
      form.get("image") instanceof File
        ? await upload(
            form.get("image") as File,
            "inventory-material-images",
            parsed.data.company_id,
            entity,
          )
        : null;
    const s = await createSupabaseServerClient();
    const { data, error } = await s.rpc("create_inventory_material", {
      payload: {
        ...parsed.data,
        image_path: image?.path,
        image_name: image?.name,
      },
    });
    if (error) throw error;
    createdId = String(data);
  } catch (e) {
    console.error(e);
    go(
      "/inventory/materials/new",
      "error",
      "No fue posible crear el material.",
    );
  }
  revalidatePath("/inventory");
  go(
    `/inventory/materials/${createdId}`,
    "success",
    "Material creado correctamente.",
  );
}

export async function registerInvoiceAction(form: FormData) {
  const ctx = await requirePermission("inventory.purchases.create");
  const base = z
    .object({
      company_id: uuid,
      business_unit_id: uuid,
      invoice_number: text.max(80),
      supplier_id: uuid,
      purchase_date: z.string().date(),
      observations: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!base.success)
    go("/inventory/invoices/new", "error", base.error.issues[0].message);
  if (
    !ctx.units.some(
      (x) =>
        x.id === base.data.business_unit_id &&
        x.company_id === base.data.company_id,
    )
  )
    go("/inventory/invoices/new", "error", "Unidad no autorizada.");
  const ids = form.getAll("material_id").map(String),
    quantities = form.getAll("quantity").map(String),
    prices = form.getAll("unit_price").map(String);
  const lines = ids
    .map((material_id, i) => ({
      material_id,
      quantity: Number(quantities[i]),
      unit_price: Number(prices[i]),
    }))
    .filter((x) => x.material_id && x.quantity > 0 && x.unit_price >= 0);
  if (!lines.length)
    go(
      "/inventory/invoices/new",
      "error",
      "Agrega al menos un material con cantidad y precio.",
    );
  try {
    const entity = crypto.randomUUID();
    const attachment =
      form.get("attachment") instanceof File
        ? await upload(
            form.get("attachment") as File,
            "inventory-invoices",
            base.data.company_id,
            entity,
          )
        : null;
    const s = await createSupabaseServerClient();
    const { error } = await s.rpc("register_inventory_invoice", {
      payload: {
        ...base.data,
        lines,
        attachment_path: attachment?.path,
        attachment_name: attachment?.name,
        attachment_mime: attachment?.mime,
        attachment_size: attachment?.size,
      },
    });
    if (error) throw error;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(e);
    go(
      "/inventory/invoices/new",
      "error",
      /existe esta factura/i.test(m)
        ? "Ya existe esta factura para el proveedor."
        : "No fue posible registrar la factura.",
    );
  }
  revalidatePath("/inventory");
  go(
    "/inventory/invoices",
    "success",
    "Factura registrada y stock actualizado.",
  );
}

export async function registerOutputAction(form: FormData) {
  const ctx = await requirePermission("inventory.outputs.create");
  const parsed = z
    .object({
      company_id: uuid,
      business_unit_id: uuid,
      material_id: uuid,
      output_date: z.string().date(),
      quantity: z.coerce.number().positive(),
      output_type: z.enum(["operational_consumption", "loss"]),
      reason: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    go("/inventory/outputs/new", "error", parsed.error.issues[0].message);
  if (
    !ctx.units.some(
      (x) =>
        x.id === parsed.data.business_unit_id &&
        x.company_id === parsed.data.company_id,
    )
  )
    go("/inventory/outputs/new", "error", "Unidad no autorizada.");
  if (parsed.data.output_type === "loss" && parsed.data.reason.length < 3)
    go(
      "/inventory/outputs/new",
      "error",
      "La observación es obligatoria para falla o pérdida.",
    );
  const s = await createSupabaseServerClient();
  const { error } = await s.rpc("register_inventory_output", {
    payload: parsed.data,
  });
  if (error) {
    console.error(error);
    go(
      "/inventory/outputs/new",
      "error",
      error.message.includes("stock suficiente")
        ? error.message
        : "No fue posible registrar la salida.",
    );
  }
  revalidatePath("/inventory");
  go("/inventory/outputs", "success", "Salida registrada y stock actualizado.");
}

export async function requestMaterialChangeAction(form: FormData) {
  await requirePermission("inventory.materials.request_change");
  const material = uuid.parse(form.get("material_id")),
    kind = z.enum(["edit", "deactivate"]).parse(form.get("request_type")),
    reason = text.min(3).parse(form.get("reason"));
  const proposed =
    kind === "edit"
      ? {
          name: text.parse(form.get("name")),
          description: String(form.get("description") || ""),
          category: text.parse(form.get("category")),
          unit_of_measure: text.parse(form.get("unit_of_measure")),
          standard_price: z.coerce
            .number()
            .min(0)
            .parse(form.get("standard_price")),
        }
      : null;
  const s = await createSupabaseServerClient();
  const { error } = await s.rpc("request_inventory_material_change", {
    material,
    kind,
    reason,
    proposed,
  });
  if (error) {
    console.error(error);
    go(
      `/inventory/materials/${material}`,
      "error",
      error.code === "23505"
        ? "Este material ya tiene una solicitud pendiente."
        : "No fue posible crear la solicitud.",
    );
  }
  revalidatePath("/inventory");
  go(
    `/inventory/materials/${material}`,
    "success",
    "Solicitud enviada a aprobación.",
  );
}

export async function decideMaterialChangeAction(form: FormData) {
  await requirePermission("inventory.approvals.decide");
  const request = uuid.parse(form.get("request_id")),
    decision = z.enum(["approved", "rejected"]).parse(form.get("decision")),
    note = String(form.get("note") || "");
  const s = await createSupabaseServerClient();
  const { error } = await s.rpc("decide_inventory_material_change", {
    request,
    decision,
    note,
  });
  if (error) {
    console.error(error);
    go(
      "/inventory/approvals",
      "error",
      "No fue posible registrar la decisión.",
    );
  }
  revalidatePath("/inventory");
  go(
    "/inventory/approvals",
    "success",
    decision === "approved" ? "Solicitud aprobada." : "Solicitud rechazada.",
  );
}

export async function inventorySignedUrl(bucket: string, path: string) {
  await requirePermission("inventory.materials.view");
  if (
    !path ||
    !["inventory-material-images", "inventory-invoices"].includes(bucket)
  )
    redirect("/inventory");
  const s = await createSupabaseServerClient();
  const { data } = await s.storage.from(bucket).createSignedUrl(path, 300);
  redirect(data?.signedUrl || "/inventory");
}
