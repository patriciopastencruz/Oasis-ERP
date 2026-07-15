import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY;
const secret = process.env.SECRET_KEY;
if (!url || !publishable || !secret) throw new Error("Falta el entorno local de Supabase");

const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const assert = (condition, name) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  results.push(name);
};
const one = async (promise, label) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const expectError = async (promise, label) => {
  const { error } = await promise;
  assert(Boolean(error), label);
  return error;
};

const company = await one(service.from("companies").select("id").eq("code", "OASIS").single(), "empresa");
const units = await one(service.from("business_units").select("id,code").eq("company_id", company.id), "unidades");
const hoc = units.find((u) => u.code === "HOC");
const roles = await one(service.from("roles").select("id,key"), "roles");
const workerRole = roles.find((r) => r.key === "worker");
const financeRole = roles.find((r) => r.key === "finance_manager");
const superRole = roles.find((r) => r.key === "superadmin");
const password = "Local-Cancel-Only-2026!";

async function testUser(prefix, role) {
  const email = `${prefix}-${crypto.randomUUID()}@oasis.local.test`;
  const auth = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error) throw auth.error;
  const id = auth.data.user.id;
  await one(service.from("profiles").insert({ id, role_id: role.id, first_name: prefix, last_name: "Prueba", email, job_title: "Prueba local", created_by: id }), "perfil");
  await one(service.from("user_companies").insert({ user_id: id, company_id: company.id, created_by: id }), "empresa usuario");
  await one(service.from("user_business_units").insert({ user_id: id, company_id: company.id, business_unit_id: hoc.id, created_by: id }), "unidad usuario");
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, client };
}

const worker = await testUser("worker", workerRole);
const finance = await testUser("finance", financeRole);
const admin = await testUser("super", superRole);
const supplier = await one(service.from("suppliers").insert({ company_id: company.id, rut: "22.222.222-2", legal_name: "Proveedor Cancelación", created_by: admin.id }).select("id").single(), "proveedor");
const category = await one(service.from("expense_categories").insert({ company_id: company.id, code: `C${Date.now()}`, name: "Categoría cancelación", created_by: admin.id }).select("id").single(), "categoría");
const center = await one(service.from("cost_centers").insert({ company_id: company.id, code: `C${Date.now()}`, name: "Centro cancelación", created_by: admin.id }).select("id").single(), "centro");

async function draft(amount = 20000) {
  return one(worker.client.from("payment_requests").insert({
    company_id: company.id, business_unit_id: hoc.id, requester_id: worker.id,
    request_type: "supplier_payment", supplier_id: supplier.id, supplier_rut: "22.222.222-2",
    supplier_legal_name: "Proveedor Cancelación", amount, expense_category_id: category.id,
    cost_center_id: center.id, description: "Solicitud de prueba de anulación", priority: "normal", created_by: worker.id,
    use_supplier_bank_account: false,
  }).select("*").single(), "borrador");
}
async function attach(request) {
  const path = `${company.id}/${request.id}/${crypto.randomUUID()}.pdf`;
  return one(worker.client.from("payment_request_attachments").insert({
    company_id: company.id, payment_request_id: request.id, object_path: path,
    original_name: "respaldo.pdf", mime_type: "application/pdf", size_bytes: 100, uploaded_by: worker.id,
  }), "respaldo");
}
async function submittedRequest(amount = 20000) {
  const d = await draft(amount);
  await attach(d);
  await one(worker.client.rpc("submit_payment_request", { payment_request_id: d.id }), "enviar");
  return d.id;
}
async function approvedRequest(amount = 20000) {
  const id = await submittedRequest(amount);
  await one(service.from("payment_requests").update({ status: "approved", cancellation_reason: null }).eq("id", id).select("id").single(), "aprobar prueba");
  return id;
}

// El Trabajador (sin finance.payments.manage) no puede anular.
const pending1 = await approvedRequest();
const deniedError = await expectError(
  worker.client.rpc("cancel_payment_request", { target_id: pending1, reason: "No debería poder" }),
  "El solicitante no puede anular",
);
assert(/no autorizado/i.test(deniedError.message), "El error indica falta de autorización");

// Finanzas no puede anular sin motivo.
await expectError(
  finance.client.rpc("cancel_payment_request", { target_id: pending1, reason: "a" }),
  "Rechaza motivo demasiado corto",
);
await expectError(
  finance.client.rpc("cancel_payment_request", { target_id: pending1, reason: "" }),
  "Rechaza motivo vacío",
);

// Finanzas anula correctamente una solicitud aprobada.
await one(
  finance.client.rpc("cancel_payment_request", { target_id: pending1, reason: "El proveedor ya no requiere el pago" }),
  "anular solicitud aprobada",
);
const cancelled = await one(
  service.from("payment_requests").select("status,cancellation_reason,cancelled_at").eq("id", pending1).single(),
  "verificar anulación",
);
assert(cancelled.status === "cancelled", "El estado queda anulado");
assert(cancelled.cancellation_reason === "El proveedor ya no requiere el pago", "El motivo se guarda");
assert(cancelled.cancelled_at !== null, "La fecha de anulación se registra");

// No se puede anular dos veces.
await expectError(
  finance.client.rpc("cancel_payment_request", { target_id: pending1, reason: "Segundo intento" }),
  "No permite anular una solicitud ya anulada",
);

// No se puede anular una solicitud que aún está pendiente de aprobación.
const stillPending = await submittedRequest();
await expectError(
  finance.client.rpc("cancel_payment_request", { target_id: stillPending, reason: "Aún no aprobada" }),
  "No permite anular una solicitud pendiente de aprobación",
);

// Queda registrada en auditoría (trigger audit_payment_requests).
const audit = await one(
  service.from("audit_logs").select("id").eq("entity_type", "payment_requests").eq("entity_id", pending1).eq("action", "update"),
  "auditoría de anulación",
);
assert(audit.length > 0, "La anulación queda en el registro de auditoría");

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
