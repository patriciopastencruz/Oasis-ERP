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
};

const company = await one(service.from("companies").select("id").eq("code", "OASIS").single(), "empresa");
const units = await one(service.from("business_units").select("id,code").eq("company_id", company.id), "unidades");
const hoc = units.find((u) => u.code === "HOC");
const roles = await one(service.from("roles").select("id,key"), "roles");
const workerRole = roles.find((r) => r.key === "worker");
const superRole = roles.find((r) => r.key === "superadmin");
const password = "Local-Stage4A-Only-2026!";

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
const stranger = await testUser("stranger", workerRole);
const admin = await testUser("super", superRole);
const supplier = await one(service.from("suppliers").insert({ company_id: company.id, rut: "11.111.111-1", legal_name: "Proveedor Etapa 4A", created_by: admin.id }).select("id").single(), "proveedor");
await one(service.from("supplier_bank_accounts").insert({ company_id: company.id, supplier_id: supplier.id, bank_name: "Banco Local", account_type: "checking", account_number: "987654321", account_holder_name: "Proveedor Etapa 4A", account_holder_rut: "11.111.111-1", active: true, verification_status: "verified", verified_at: new Date().toISOString(), verified_by: admin.id, created_by: admin.id }), "cuenta bancaria");
const category = await one(service.from("expense_categories").insert({ company_id: company.id, code: `T${Date.now()}`, name: "Categoría prueba", created_by: admin.id }).select("id").single(), "categoría");
const center = await one(service.from("cost_centers").insert({ company_id: company.id, code: `T${Date.now()}`, name: "Centro prueba", created_by: admin.id }).select("id").single(), "centro");

async function draft(owner = worker, amount = 50000, unit = hoc) {
  return one(owner.client.from("payment_requests").insert({
    company_id: company.id, business_unit_id: unit.id, requester_id: owner.id,
    request_type: "supplier_payment", supplier_id: supplier.id, supplier_rut: "11.111.111-1",
    supplier_legal_name: "Proveedor Etapa 4A", amount, expense_category_id: category.id,
    cost_center_id: center.id, description: "Solicitud de prueba local", priority: "normal", created_by: owner.id,
  }).select("*").single(), "borrador");
}
async function attachment(request, owner = worker) {
  const path = `${company.id}/${request.id}/${crypto.randomUUID()}.pdf`;
  return one(owner.client.from("payment_request_attachments").insert({ company_id: company.id,
    payment_request_id: request.id, object_path: path, original_name: "prueba.pdf",
    mime_type: "application/pdf", size_bytes: 100, uploaded_by: owner.id }).select("*").single(), "respaldo");
}

const previewDraft = await draft();
const before = await one(service.from("payment_requests").select("status,request_number,approval_instance_id").eq("id", previewDraft.id).single(), "antes preview");
const preview = await one(worker.client.rpc("preview_payment_request_workflow", { payment_request_id: previewDraft.id }), "preview");
const after = await one(service.from("payment_requests").select("status,request_number,approval_instance_id").eq("id", previewDraft.id).single(), "después preview");
assert(preview.code === "PAY-LOW" && preview.steps.length > 0, "Preview devuelve workflow y etapas correctos");
assert(JSON.stringify(before) === JSON.stringify(after), "Preview no modifica estado, correlativo ni instancia");
await expectError(stranger.client.rpc("preview_payment_request_workflow", { payment_request_id: previewDraft.id }), "Preview no expone solicitud ajena");

const removable = await attachment(previewDraft);
await expectError(stranger.client.rpc("delete_payment_request_attachment", { attachment_id: removable.id }), "No elimina respaldo ajeno");
const deleted = await one(worker.client.rpc("delete_payment_request_attachment", { attachment_id: removable.id }), "eliminar respaldo");
assert(deleted.object_path === removable.object_path && !deleted.already_deleted, "Eliminación devuelve ruta autorizada real");
const deletedAgain = await one(worker.client.rpc("delete_payment_request_attachment", { attachment_id: removable.id }), "eliminar otra vez");
assert(deletedAgain.already_deleted, "Eliminación lógica es idempotente");
const audit = await one(service.from("audit_logs").select("id").eq("entity_type", "payment_request_attachments").eq("entity_id", removable.id), "auditoría");
assert(audit.length === 1, "Eliminación registra auditoría una sola vez");

const valid = await draft();
await attachment(valid);
const submitted = await one(worker.client.rpc("submit_payment_request", { payment_request_id: valid.id }), "enviar");
assert(submitted.status === "pending_approval" && submitted.request_number && submitted.revision === 1, "Submit genera correlativo e instancia");
const second = await one(worker.client.rpc("submit_payment_request", { payment_request_id: valid.id }), "reenviar");
assert(second.already_submitted && second.approval_instance_id === submitted.approval_instance_id, "Doble envío secuencial es idempotente");
const counts = await one(service.from("payment_request_approval_instances").select("id").eq("payment_request_id", valid.id), "instancias");
assert(counts.length === 1, "Doble envío no duplica instancia");
await expectError(worker.client.rpc("delete_payment_request_attachment", { attachment_id: (await one(service.from("payment_request_attachments").select("id").eq("payment_request_id", valid.id).single(), "respaldo enviado")).id }), "No elimina respaldo enviado");

const concurrent = await draft();
await attachment(concurrent);
const concurrentResults = await Promise.all([
  worker.client.rpc("submit_payment_request", { payment_request_id: concurrent.id }),
  worker.client.rpc("submit_payment_request", { payment_request_id: concurrent.id }),
]);
assert(concurrentResults.every((r) => !r.error), "Doble envío concurrente termina sin error");
const concurrentInstances = await one(service.from("payment_request_approval_instances").select("id").eq("payment_request_id", concurrent.id), "instancias concurrentes");
assert(concurrentInstances.length === 1, "Doble envío concurrente no duplica instancia");

const withoutAttachment = await draft();
await expectError(worker.client.rpc("submit_payment_request", { payment_request_id: withoutAttachment.id }), "Submit falla sin respaldo");

const noWorkflow = await draft(worker, 50000, hoc);
await attachment(noWorkflow);
await one(service.from("approval_workflows").update({ active: false }).eq("business_unit_id", hoc.id), "desactivar workflows");
await expectError(worker.client.rpc("preview_payment_request_workflow", { payment_request_id: noWorkflow.id }), "Preview falla sin workflow");
await expectError(worker.client.rpc("submit_payment_request", { payment_request_id: noWorkflow.id }), "Submit falla sin workflow");
await one(service.from("approval_workflows").update({ active: true }).eq("business_unit_id", hoc.id), "reactivar workflows");

const approved = await one(service.from("payment_requests").update({ status: "approved" }).eq("id", valid.id).select("id").single(), "aprobar prueba");
await expectError(worker.client.rpc("submit_payment_request", { payment_request_id: approved.id }), "Submit rechaza solicitud aprobada");

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
