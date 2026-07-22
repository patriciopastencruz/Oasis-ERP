"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { salesContext } from "./queries";

const uuid = z.string().uuid();

function done(path: string, type: "success" | "error", message: string): never {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}
function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/autoriz|permission|row-level/i.test(value))
    return "No tienes autorización para esta acción.";
  return value;
}

function parseLines(form: FormData) {
  try {
    const lines = JSON.parse(String(form.get("lines") ?? "[]"));
    if (!Array.isArray(lines) || lines.length === 0) return null;
    return lines;
  } catch {
    return null;
  }
}

function quotationPayload(form: FormData, lines: unknown) {
  return {
    client_company: String(form.get("client_company") ?? ""),
    client_rut: String(form.get("client_rut") ?? ""),
    client_contact: String(form.get("client_contact") ?? ""),
    client_email: String(form.get("client_email") ?? ""),
    client_place: String(form.get("client_place") ?? ""),
    discount: Number(form.get("discount") ?? 0),
    terms: String(form.get("terms") ?? ""),
    lines,
  };
}

export async function createQuotationAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const lines = parseLines(form);
  if (!lines)
    done("/sales/quotations/new", "error", "La cotización requiere ítems.");
  const { data, error } = await supabase.rpc("om_create_quotation", {
    payload: quotationPayload(form, lines),
  });
  if (error) done("/sales/quotations/new", "error", errorMessage(error));
  revalidatePath("/sales/quotations");
  done(`/sales/quotations/${data}`, "success", "Cotización creada.");
}

export async function updateQuotationAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const id = uuid.parse(form.get("quotation_id"));
  const returnPath = `/sales/quotations/${id}`;
  const lines = parseLines(form);
  if (!lines) done(returnPath, "error", "La cotización requiere ítems.");
  const { error } = await supabase.rpc("om_update_quotation", {
    target_quotation: id,
    payload: quotationPayload(form, lines),
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/quotations");
  revalidatePath(returnPath);
  done(returnPath, "success", "Cotización actualizada.");
}

export async function submitQuotationAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const id = uuid.parse(form.get("quotation_id"));
  const returnPath = `/sales/quotations/${id}`;
  const { error } = await supabase.rpc("om_submit_quotation", {
    target_quotation: id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/quotations");
  revalidatePath(returnPath);
  done(returnPath, "success", "Cotización enviada a aprobación.");
}

export async function reviewQuotationAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.approve");
  const id = uuid.parse(form.get("quotation_id"));
  const decision = z.enum(["approved", "rejected"]).parse(form.get("decision"));
  const comment = String(form.get("comment") ?? "");
  const returnPath =
    form.get("return_to") === "/admin/approvals"
      ? "/admin/approvals"
      : "/sales/quotations/approvals";
  const { error } = await supabase.rpc("om_review_quotation", {
    target_quotation: id,
    decision,
    comment_text: comment,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/quotations");
  revalidatePath("/sales/quotations/approvals");
  revalidatePath("/admin/approvals");
  revalidatePath(`/sales/quotations/${id}`);
  done(
    returnPath,
    "success",
    decision === "approved" ? "Cotización aprobada." : "Cotización rechazada.",
  );
}

export async function markDeliveredAction(form: FormData) {
  const { supabase } = await salesContext("sales.quotations.create");
  const id = uuid.parse(form.get("quotation_id"));
  const returnPath = `/sales/quotations/${id}`;
  const { error } = await supabase.rpc("om_mark_quotation_delivered", {
    target_quotation: id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/sales/quotations");
  revalidatePath(returnPath);
  done(returnPath, "success", "Cotización marcada como entregada.");
}
