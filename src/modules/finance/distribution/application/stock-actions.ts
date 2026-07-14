"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { distributionContext } from "./queries";

const stockPath = "/finance/distribution/stock";
const uuid = z.string().uuid();

function go(key: "success" | "error", message: string): never {
  redirect(`${stockPath}?${key}=${encodeURIComponent(message)}`);
}

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "bin";
}

export async function registerDistributionStockInvoiceAction(form: FormData) {
  const { unit, company, supabase } = await distributionContext(
    "finance.distribution.stock.manage",
  );
  const parsed = z
    .object({
      invoice_number: z.string().trim().min(1).max(80),
      supplier_id: uuid,
      purchase_date: z.string().date(),
      observations: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) go("error", parsed.error.issues[0].message);

  const ids = form.getAll("material_id").map(String);
  const quantities = form.getAll("quantity").map(Number);
  const prices = form.getAll("unit_price").map(Number);
  const lines = ids
    .map((material_id, index) => ({
      material_id,
      quantity: quantities[index],
      unit_price: prices[index],
    }))
    .filter(
      (line) =>
        uuid.safeParse(line.material_id).success &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0 &&
        Number.isFinite(line.unit_price) &&
        line.unit_price >= 0,
    );
  if (!lines.length)
    go("error", "Agrega al menos un producto con cantidad y precio.");

  const attachment = form.get("attachment");
  if (!(attachment instanceof File) || !attachment.size)
    go("error", "Debes adjuntar una foto o PDF de la factura.");
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(attachment.type) || attachment.size > 10_485_760)
    go("error", "La factura debe ser PDF, JPG o PNG y pesar hasta 10 MB.");

  const invoiceId = crypto.randomUUID();
  const objectPath = `${company.id}/${unit.id}/${invoiceId}/${crypto.randomUUID()}.${fileExtension(attachment)}`;
  const { error: uploadError } = await supabase.storage
    .from("inventory-invoices")
    .upload(objectPath, attachment, { contentType: attachment.type });
  if (uploadError) {
    console.error(uploadError);
    go("error", "No fue posible cargar la factura.");
  }

  const { error } = await supabase.rpc("register_inventory_invoice", {
    payload: {
      company_id: company.id,
      business_unit_id: unit.id,
      ...parsed.data,
      lines,
      attachment_path: objectPath,
      attachment_name: attachment.name,
      attachment_mime: attachment.type,
      attachment_size: attachment.size,
    },
  });
  if (error) {
    await supabase.storage.from("inventory-invoices").remove([objectPath]);
    console.error(error);
    go(
      "error",
      /existe esta factura/i.test(error.message)
        ? "Ya existe esta factura para el proveedor."
        : "No fue posible registrar la factura.",
    );
  }
  revalidatePath(stockPath);
  go("success", "Factura registrada y stock actualizado correctamente.");
}

export async function registerDistributionStockOutputAction(form: FormData) {
  const { unit, company, supabase } = await distributionContext(
    "finance.distribution.stock.manage",
  );
  const parsed = z
    .object({
      material_id: uuid,
      output_date: z.string().date(),
      quantity: z.coerce.number().positive(),
      output_type: z.enum(["operational_consumption", "loss"]),
      reason: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) go("error", parsed.error.issues[0].message);
  if (parsed.data.output_type === "loss" && parsed.data.reason.length < 3)
    go("error", "Indica el motivo de la pérdida.");

  const { error } = await supabase.rpc("register_inventory_output", {
    payload: {
      company_id: company.id,
      business_unit_id: unit.id,
      ...parsed.data,
    },
  });
  if (error) {
    console.error(error);
    go(
      "error",
      error.message.includes("stock suficiente")
        ? error.message
        : "No fue posible registrar la salida.",
    );
  }
  revalidatePath(stockPath);
  go("success", "Salida registrada y stock actualizado.");
}
