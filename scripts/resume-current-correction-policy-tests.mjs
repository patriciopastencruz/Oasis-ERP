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

const company = await one(service.from("companies").select("id").eq("code", "OASIS").single(), "empresa");
const units = await one(service.from("business_units").select("id,code").eq("company_id", company.id), "unidades");
const hoc = units.find((u) => u.code === "HOC");
const roles = await one(service.from("roles").select("id,key"), "roles");
const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));
const password = "Local-Resume-Only-2026!";

async function testUser(prefix, roleKey) {
  const email = `${prefix}-${crypto.randomUUID()}@oasis.local.test`;
  const auth = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error) throw auth.error;
  const id = auth.data.user.id;
  await one(service.from("profiles").insert({ id, role_id: roleId[roleKey], first_name: prefix, last_name: "Prueba", email, job_title: "Prueba local", created_by: id }), "perfil");
  await one(service.from("user_companies").insert({ user_id: id, company_id: company.id, created_by: id }), "empresa usuario");
  await one(service.from("user_business_units").insert({ user_id: id, company_id: company.id, business_unit_id: hoc.id, created_by: id }), "unidad usuario");
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id, client };
}

const worker = await testUser("worker", "worker");
const admin = await testUser("admin", "administrator");
const finance = await testUser("finance", "finance_manager");
const supplier = await one(service.from("suppliers").insert({ company_id: company.id, rut: "44.444.444-4", legal_name: "Proveedor Resume", created_by: admin.id }).select("id").single(), "proveedor");
const category = await one(service.from("expense_categories").insert({ company_id: company.id, code: `R${Date.now()}`, name: "Categoría resume", created_by: admin.id }).select("id").single(), "categoría");
const center = await one(service.from("cost_centers").insert({ company_id: company.id, code: `R${Date.now()}`, name: "Centro resume", created_by: admin.id }).select("id").single(), "centro");

// Se desactivan los flujos sembrados para que el flujo de prueba sea el único aplicable.
await one(service.from("approval_workflows").update({ active: false }).eq("business_unit_id", hoc.id), "desactivar flujos sembrados");

async function setupWorkflow(code, correctionPolicy) {
  const workflow = await one(
    service.from("approval_workflows").insert({
      company_id: company.id, business_unit_id: hoc.id, code, name: code,
      correction_policy: correctionPolicy, active: true, priority_order: 1,
    }).select("id").single(),
    `crear flujo ${code}`,
  );
  await one(service.from("approval_workflow_conditions").insert({ company_id: company.id, workflow_id: workflow.id, min_amount: 0, max_amount: null }), `condición ${code}`);
  await one(
    service.from("approval_workflow_steps").insert([
      { company_id: company.id, workflow_id: workflow.id, name: "Aprobación de Administrador", sequence_order: 1, required_role_id: roleId.administrator, is_required: true, allow_higher_role_substitution: false },
      { company_id: company.id, workflow_id: workflow.id, name: "Aprobación de Finanzas", sequence_order: 2, required_role_id: roleId.finance_manager, is_required: true, allow_higher_role_substitution: false },
    ]),
    `etapas ${code}`,
  );
  return workflow.id;
}

async function draft(amount = 50000) {
  return one(worker.client.from("payment_requests").insert({
    company_id: company.id, business_unit_id: hoc.id, requester_id: worker.id,
    request_type: "supplier_payment", supplier_id: supplier.id, supplier_rut: "44.444.444-4",
    supplier_legal_name: "Proveedor Resume", amount, expense_category_id: category.id,
    cost_center_id: center.id, description: "Solicitud de prueba resume_current", priority: "normal",
    created_by: worker.id, use_supplier_bank_account: false,
  }).select("*").single(), "borrador");
}
async function attach(request) {
  const path = `${company.id}/${request.id}/${crypto.randomUUID()}.pdf`;
  return one(worker.client.from("payment_request_attachments").insert({
    company_id: company.id, payment_request_id: request.id, object_path: path,
    original_name: "respaldo.pdf", mime_type: "application/pdf", size_bytes: 100, uploaded_by: worker.id,
  }), "respaldo");
}
async function stepFor(requestId, roleKey) {
  const instance = await one(
    service.from("payment_request_approval_instances").select("id,revision").eq("payment_request_id", requestId).order("revision", { ascending: false }).limit(1).single(),
    "instancia actual",
  );
  const step = await one(
    service.from("payment_request_approval_steps").select("id,status,decided_by,decided_at").eq("approval_instance_id", instance.id).eq("required_role_id", roleId[roleKey]).single(),
    `etapa ${roleKey}`,
  );
  return { instance, step };
}

// --- resume_current: la etapa ya aprobada no se vuelve a pedir tras corregir. ---
await setupWorkflow("TEST-RESUME", "resume_current");
const resumeRequest = await draft();
await attach(resumeRequest);
await one(worker.client.rpc("submit_payment_request", { payment_request_id: resumeRequest.id }), "enviar (resume)");

const { step: adminStepBefore } = await stepFor(resumeRequest.id, "administrator");
await one(admin.client.rpc("decide_payment_request_approval_step", { target_step: adminStepBefore.id, decision: "approve", decision_comment: "Aprobado por Administrador" }), "aprobar etapa 1 (resume)");
const { step: adminStep1 } = await stepFor(resumeRequest.id, "administrator");

const { step: financeStep1 } = await stepFor(resumeRequest.id, "finance_manager");
await one(finance.client.rpc("decide_payment_request_approval_step", { target_step: financeStep1.id, decision: "request_correction", decision_comment: "Falta el RUT del proveedor" }), "pedir corrección (resume)");

const afterCorrection = await one(service.from("payment_requests").select("status").eq("id", resumeRequest.id).single(), "estado tras corrección (resume)");
assert(afterCorrection.status === "correction_requested", "El pedido queda en corrección solicitada (resume)");

await one(worker.client.rpc("submit_payment_request", { payment_request_id: resumeRequest.id }), "reenviar (resume)");

const instances = await one(service.from("payment_request_approval_instances").select("id,revision").eq("payment_request_id", resumeRequest.id).order("revision"), "instancias (resume)");
assert(instances.length === 2, "El reenvío crea una segunda revisión (resume)");

const { step: adminStep2 } = await stepFor(resumeRequest.id, "administrator");
assert(adminStep2.status === "approved", "La etapa de Administrador queda aprobada en la revisión nueva (resume)");
assert(adminStep2.decided_by === admin.id, "Se conserva quién aprobó originalmente (resume)");
assert(
  adminStep2.decided_at !== null && new Date(adminStep2.decided_at).getTime() === new Date(adminStep1.decided_at).getTime(),
  "Se conserva la fecha de aprobación original (resume)",
);

const { step: financeStep2 } = await stepFor(resumeRequest.id, "finance_manager");
assert(financeStep2.status === "pending", "La etapa que pidió corrección vuelve a quedar pendiente (resume)");

const canAdminApproveAgain = await one(admin.client.rpc("can_approve_workflow_step", { target_step: adminStep2.id }), "revisar si Administrador puede volver a aprobar");
assert(canAdminApproveAgain === false, "Al Administrador ya no se le pide aprobar de nuevo (resume)");

await one(finance.client.rpc("decide_payment_request_approval_step", { target_step: financeStep2.id, decision: "approve", decision_comment: "RUT corregido, aprobado" }), "aprobar etapa 2 tras corrección (resume)");
const finalStatus = await one(service.from("payment_requests").select("status").eq("id", resumeRequest.id).single(), "estado final (resume)");
assert(finalStatus.status === "approved", "El pedido queda aprobado al completar la etapa pendiente (resume)");

// --- restart_all: comportamiento sin cambios, se reinicia todo. ---
await setupWorkflow("TEST-RESTART", "restart_all");
await one(service.from("approval_workflows").update({ active: false }).eq("code", "TEST-RESUME"), "desactivar TEST-RESUME");
const restartRequest = await draft(60000);
await attach(restartRequest);
await one(worker.client.rpc("submit_payment_request", { payment_request_id: restartRequest.id }), "enviar (restart)");

const { step: adminRestart1 } = await stepFor(restartRequest.id, "administrator");
await one(admin.client.rpc("decide_payment_request_approval_step", { target_step: adminRestart1.id, decision: "approve", decision_comment: "Aprobado" }), "aprobar etapa 1 (restart)");
const { step: financeRestart1 } = await stepFor(restartRequest.id, "finance_manager");
await one(finance.client.rpc("decide_payment_request_approval_step", { target_step: financeRestart1.id, decision: "request_correction", decision_comment: "Falta información" }), "pedir corrección (restart)");
await one(worker.client.rpc("submit_payment_request", { payment_request_id: restartRequest.id }), "reenviar (restart)");

const { step: adminRestart2 } = await stepFor(restartRequest.id, "administrator");
assert(adminRestart2.status === "pending", "restart_all sigue reiniciando la etapa ya aprobada (regresión)");

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
