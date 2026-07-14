"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { distributionContext } from "./queries";

const uuid = z.string().uuid();
const text = z.string().trim().min(1);
function done(path: string, type: "success" | "error", message: string): never {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}
function errorMessage(error: { message?: string } | null) {
  const value = error?.message ?? "No fue posible completar la operación.";
  if (/credito|crédito/i.test(value)) return value;
  if (/cerrad/i.test(value)) return "La jornada está cerrada.";
  if (/autoriz|permission|row-level/i.test(value))
    return "No tienes autorización para esta acción.";
  return value;
}

export async function createCustomerAction(form: FormData) {
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.customers.manage",
  );
  const parsed = z
    .object({
      name: text.max(160),
      address: text.max(300),
      phone: text.max(50),
      classification_id: uuid,
      email: z.string().trim().email().or(z.literal("")),
      status: z.enum(["active", "inactive", "suspended"]),
      has_credit: z.enum(["on", "off"]).default("off"),
      credit_limit: z.coerce.number().min(0),
      credit_days: z.coerce.number().int().min(0).max(365),
    })
    .safeParse({
      ...Object.fromEntries(form),
      has_credit: form.get("has_credit") ? "on" : "off",
    });
  if (!parsed.success)
    done(
      "/finance/distribution/customers",
      "error",
      parsed.error.issues[0].message,
    );
  const hasCredit = parsed.data.has_credit === "on";
  const { error } = await supabase.from("dist_customers").insert({
    company_id: unit.company_id,
    business_unit_id: unit.id,
    name: parsed.data.name,
    address: parsed.data.address,
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    classification_id: parsed.data.classification_id,
    status: parsed.data.status,
    has_credit: hasCredit,
    credit_limit: hasCredit ? parsed.data.credit_limit : 0,
    credit_days: hasCredit ? parsed.data.credit_days : 0,
    credit_status: hasCredit ? "current" : "suspended",
    created_by: ctx.user.id,
  });
  if (error)
    done("/finance/distribution/customers", "error", errorMessage(error));
  revalidatePath("/finance/distribution");
  done(
    "/finance/distribution/customers",
    "success",
    "Cliente creado correctamente.",
  );
}

export async function createPriceAction(form: FormData) {
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.catalogs.manage",
  );
  const parsed = z
    .object({
      product_id: uuid,
      customer_id: z.string().uuid().or(z.literal("")),
      amount: z.coerce.number().min(0),
      valid_from: z.string().date(),
      valid_until: z.string(),
      change_reason: text.max(300),
    })
    .refine(
      (value) => !value.valid_until || value.valid_until >= value.valid_from,
      { message: "La fecha hasta no puede ser anterior a la fecha desde." },
    )
    .safeParse(Object.fromEntries(form));
  const requestedCustomer = String(form.get("customer_id") ?? "");
  const returnPath = uuid.safeParse(requestedCustomer).success
    ? `/finance/distribution/customers/${requestedCustomer}`
    : "/finance/distribution/catalogs";
  if (!parsed.success)
    done(returnPath, "error", parsed.error.issues[0].message);

  const [product, customer] = await Promise.all([
    supabase
      .from("dist_products")
      .select("id")
      .eq("id", parsed.data.product_id)
      .eq("business_unit_id", unit.id)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    parsed.data.customer_id
      ? supabase
          .from("dist_customers")
          .select("id")
          .eq("id", parsed.data.customer_id)
          .eq("business_unit_id", unit.id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (product.error || !product.data)
    done(returnPath, "error", "El producto no pertenece a esta unidad.");
  if (parsed.data.customer_id && (customer.error || !customer.data))
    done(returnPath, "error", "El cliente no pertenece a esta unidad.");

  const { error } = await supabase.from("dist_prices").insert({
    company_id: unit.company_id,
    business_unit_id: unit.id,
    product_id: parsed.data.product_id,
    customer_id: parsed.data.customer_id || null,
    amount: parsed.data.amount,
    valid_from: parsed.data.valid_from,
    valid_until: parsed.data.valid_until || null,
    change_reason: parsed.data.change_reason,
    created_by: ctx.user.id,
  });
  if (error) done(returnPath, "error", errorMessage(error));
  revalidatePath("/finance/distribution/catalogs");
  if (parsed.data.customer_id)
    revalidatePath(
      `/finance/distribution/customers/${parsed.data.customer_id}`,
    );
  done(
    returnPath,
    "success",
    parsed.data.customer_id
      ? "Precio especial asignado al cliente."
      : "Precio general vigente creado.",
  );
}

export async function createOrderAction(form: FormData) {
  const { unit, supabase } = await distributionContext(
    "finance.distribution.orders.create",
  );
  let lines: unknown;
  try {
    lines = JSON.parse(String(form.get("lines") ?? "[]"));
  } catch {
    done("/finance/distribution/orders/new", "error", "Productos inválidos.");
  }
  const parsed = z
    .object({
      delivery_date: z.string().date(),
      estimated_time: z.string(),
      customer_id: uuid,
      delivery_address: text.max(300),
      customer_phone: z.string().trim().max(50),
      payment_method: z.enum(["cash", "transfer", "credit", "mixed"]),
      payment_condition: z.enum(["cash", "credit"]),
      priority: z.enum(["low", "normal", "high", "urgent"]),
      notes: z.string().trim().max(1000),
      lines: z
        .array(z.object({ product_id: uuid, quantity: z.number().positive() }))
        .min(1),
    })
    .safeParse({ ...Object.fromEntries(form), lines });
  if (!parsed.success)
    done(
      "/finance/distribution/orders/new",
      "error",
      parsed.error.issues[0].message,
    );
  const { data, error } = await supabase.rpc("dist_create_order", {
    payload: { ...parsed.data, business_unit_id: unit.id, route_sale: false },
  });
  if (error)
    done("/finance/distribution/orders/new", "error", errorMessage(error));
  revalidatePath("/finance/distribution");
  redirect(
    `/finance/distribution?date=${parsed.data.delivery_date}&success=${encodeURIComponent(`Pedido ${data} creado.`)}`,
  );
}

export async function assignOrderAction(form: FormData) {
  const { supabase } = await distributionContext(
    "finance.distribution.routes.manage",
  );
  const order = uuid.parse(form.get("order_id"));
  const driver = uuid.parse(form.get("driver_id"));
  const { error } = await supabase.rpc("dist_assign_order", {
    target_order: order,
    target_driver: driver,
  });
  if (error) done("/finance/distribution", "error", errorMessage(error));
  revalidatePath("/finance/distribution");
  done("/finance/distribution", "success", "Chofer asignado.");
}

export async function changeOrderStatusAction(form: FormData) {
  const { supabase } = await distributionContext();
  const id = uuid.parse(form.get("order_id"));
  const status = text.parse(form.get("status"));
  const reason = String(form.get("reason") ?? "");
  const { error } = await supabase.rpc("dist_change_order_status", {
    target_order: id,
    target_status: status,
    details: { reason, notes: String(form.get("notes") ?? "") },
  });
  if (error) done("/finance/distribution/driver", "error", errorMessage(error));
  revalidatePath("/finance/distribution/driver");
  done("/finance/distribution/driver", "success", "Estado actualizado.");
}

export async function requestOrderChangeAction(form: FormData) {
  const { supabase } = await distributionContext(
    "finance.distribution.requests.create",
  );
  const { error } = await supabase.rpc("dist_request_order_change", {
    target_order: uuid.parse(form.get("order_id")),
    request_type: z.enum(["edit", "void"]).parse(form.get("type")),
    reason_text: text.min(3).parse(form.get("reason")),
    proposed: {},
  });
  if (error)
    done("/finance/distribution/requests", "error", errorMessage(error));
  done("/finance/distribution/requests", "success", "Solicitud enviada.");
}

export async function reviewOrderChangeAction(form: FormData) {
  const { supabase } = await distributionContext(
    "finance.distribution.requests.review",
  );
  const { error } = await supabase.rpc("dist_review_order_change", {
    target_request: uuid.parse(form.get("request_id")),
    decision: z.enum(["approved", "rejected"]).parse(form.get("decision")),
    comment_text: text.min(3).parse(form.get("comment")),
  });
  if (error)
    done("/finance/distribution/requests", "error", errorMessage(error));
  done("/finance/distribution/requests", "success", "Solicitud resuelta.");
}

export async function registerPaymentAction(form: FormData) {
  const { supabase } = await distributionContext();
  const { error } = await supabase.rpc("dist_register_payment", {
    target_order: uuid.parse(form.get("order_id")),
    payment_amount: z.coerce.number().positive().parse(form.get("amount")),
    payment_method: z
      .enum(["cash", "transfer", "mixed"])
      .parse(form.get("method")),
    receipt: String(form.get("receipt") ?? ""),
    notes_text: String(form.get("notes") ?? ""),
    idempotency: crypto.randomUUID(),
  });
  if (error)
    done("/finance/distribution/payments", "error", errorMessage(error));
  revalidatePath("/finance/distribution");
  done("/finance/distribution/payments", "success", "Cobro registrado.");
}

export async function closeDayAction(form: FormData) {
  const { ctx, unit, supabase } = await distributionContext(
    "finance.distribution.closures.manage",
  );
  const date = z.string().date().parse(form.get("date"));
  const { data: snapshot, error: summaryError } = await supabase.rpc(
    "dist_daily_summary",
    { target_unit: unit.id, target_date: date },
  );
  if (summaryError)
    done("/finance/distribution/reports", "error", errorMessage(summaryError));
  const { error } = await supabase.from("dist_daily_closures").upsert(
    {
      company_id: unit.company_id,
      business_unit_id: unit.id,
      closure_date: date,
      status: "closed",
      snapshot,
      closed_by: ctx.user.id,
      closed_at: new Date().toISOString(),
      created_by: ctx.user.id,
    },
    { onConflict: "business_unit_id,closure_date" },
  );
  if (error)
    done("/finance/distribution/reports", "error", errorMessage(error));
  done(
    "/finance/distribution/reports",
    "success",
    "Jornada cerrada con snapshot auditable.",
  );
}
