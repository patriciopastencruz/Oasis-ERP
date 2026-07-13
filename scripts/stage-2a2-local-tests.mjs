import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY;
const secret = process.env.SECRET_KEY;
if (!url || !publishable || !secret) throw new Error("Missing local Supabase environment");

const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const password = "Local-Test-Only-2026!";
const roles = ["superadmin", "general_manager", "area_manager", "finance_manager", "administrator", "worker"];
const clients = {};
const users = {};
const results = [];

function ok(name, detail = "") { results.push({ name, status: "PASS", detail }); }
function assert(value, name, detail = "") { if (!value) throw new Error(`FAIL ${name}: ${detail}`); ok(name, detail); }
function expectError(error, name) { assert(Boolean(error), name, error?.message ?? "expected denial"); }
async function one(query, context) { const { data, error } = await query; if (error) throw new Error(`${context}: ${error.message}`); return data; }

for (const role of roles) {
  const email = `${role}@oasis.local.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users[role] = data.user;
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  clients[role] = client;
}
ok("Seis usuarios reales de Auth local creados");

const roleRows = await one(service.from("roles").select("id,key"), "roles");
const roleId = Object.fromEntries(roleRows.map((r) => [r.key, r.id]));
const company = await one(service.from("companies").select("id").eq("code", "OASIS").single(), "company");
const units = await one(service.from("business_units").select("id,code").eq("company_id", company.id), "units");
const unit = Object.fromEntries(units.map((u) => [u.code, u.id]));

for (const role of roles) {
  const user = users[role];
  await one(service.from("profiles").insert({ id: user.id, role_id: roleId[role], first_name: role, last_name: "Prueba", email: user.email, job_title: role, created_by: users.superadmin.id }), `profile ${role}`);
  await one(service.from("user_companies").insert({ user_id: user.id, company_id: company.id, created_by: users.superadmin.id }), `company assignment ${role}`);
}
for (const role of roles) {
  const assigned = role === "worker" ? ["HOC", "HOB"] : role === "administrator" ? ["HOC", "HOB"] : ["HOC", "HOB", "OM"];
  await one(service.from("user_business_units").insert(assigned.map((code) => ({ user_id: users[role].id, company_id: company.id, business_unit_id: unit[code], created_by: users.superadmin.id }))), `unit assignment ${role}`);
}

const otherCompany = await one(service.from("companies").insert({ code: "OTHER", legal_name: "Empresa Ficticia Dos", trade_name: "Empresa Dos", rut: "22.222.222-2", created_by: users.superadmin.id }).select("id").single(), "other company");
const otherUnit = await one(service.from("business_units").insert({ company_id: otherCompany.id, code: "OT", name: "Unidad Ficticia", created_by: users.superadmin.id }).select("id").single(), "other unit");
const workerCompanies = await one(clients.worker.from("companies").select("id"), "worker companies");
assert(workerCompanies.length === 1 && workerCompanies[0].id === company.id, "Usuario no accede a otra empresa");

const supplier = await one(service.from("suppliers").insert({ company_id: company.id, rut: "11.111.111-1", legal_name: "Proveedor Local de Prueba", created_by: users.superadmin.id }).select("id").single(), "supplier");
await one(service.from("supplier_bank_accounts").insert({ company_id: company.id, supplier_id: supplier.id, bank_name: "Banco Local", account_type: "checking", account_number: "123456789", account_holder_name: "Proveedor Local de Prueba", account_holder_rut: "11.111.111-1", receipt_email: "proveedor@oasis.local.test", active: true, verification_status: "verified", verified_at: new Date().toISOString(), verified_by: users.superadmin.id, created_by: users.superadmin.id }), "supplier bank account");
const category = await one(service.from("expense_categories").insert({ company_id: company.id, code: "TEST", name: "Pruebas", created_by: users.superadmin.id }).select("id").single(), "category");
const center = await one(service.from("cost_centers").insert({ company_id: company.id, code: "TEST", name: "Pruebas", created_by: users.superadmin.id }).select("id").single(), "cost center");

const hobWorkflows = await one(service.from("approval_workflows").select("id").eq("business_unit_id", unit.HOB), "HOB workflows");
await one(service.from("approval_workflows").update({ active: false }).in("id", hobWorkflows.map((w) => w.id)), "disable HOB defaults");

async function workflow(code, requestType, steps) {
  const w = await one(service.from("approval_workflows").insert({ company_id: company.id, business_unit_id: unit.HOB, code, name: code, correction_policy: "restart_all", created_by: users.superadmin.id }).select("id").single(), code);
  await one(service.from("approval_workflow_conditions").insert({ company_id: company.id, workflow_id: w.id, request_type: requestType, min_amount: 1, created_by: users.superadmin.id }), `${code} condition`);
  const rows = steps.map((s) => ({ company_id: company.id, workflow_id: w.id, name: s.name, sequence_order: s.order, parallel_group: s.group ?? 1, execution_mode: s.mode ?? "sequential", required_role_id: roleId[s.role], is_required: true, allow_higher_role_substitution: s.substitute ?? false, created_by: users.superadmin.id }));
  const created = await one(service.from("approval_workflow_steps").insert(rows).select("id,sequence_order,required_role_id,allow_higher_role_substitution"), `${code} steps`);
  return { ...w, steps: created };
}
const sequential = await workflow("TEST-SEQUENTIAL", "advance", [
  { name: "Administrador", order: 1, role: "administrator" },
  { name: "Finanzas", order: 2, role: "finance_manager" },
]);
await workflow("TEST-PARALLEL", "reimbursement", [
  { name: "Administrador paralelo", order: 1, group: 1, mode: "parallel", role: "administrator" },
  { name: "Finanzas paralelo", order: 1, group: 1, mode: "parallel", role: "finance_manager" },
]);
const substitution = await workflow("TEST-SUBSTITUTION", "other", [
  { name: "Gerencia sin sustitución", order: 1, role: "area_manager", substitute: false },
]);

async function createRequest(clientName, code, amount, requestType = "supplier_payment") {
  const client = clients[clientName];
  const request = await one(client.from("payment_requests").insert({ company_id: company.id, business_unit_id: unit[code], requester_id: users[clientName].id, request_type: requestType, supplier_id: supplier.id, supplier_rut: "11.111.111-1", supplier_legal_name: "Proveedor Local de Prueba", amount, expense_category_id: category.id, cost_center_id: center.id, description: `Solicitud ${requestType} ${amount}`, priority: "normal", created_by: users[clientName].id }).select("*").single(), "create request");
  const path = `${company.id}/${request.id}/${crypto.randomUUID()}.pdf`;
  const upload = await client.storage.from("payment-request-attachments").upload(path, new Blob(["%PDF-1.4 local test"], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (upload.error) throw new Error(`upload: ${upload.error.message}`);
  await one(client.from("payment_request_attachments").insert({ company_id: company.id, payment_request_id: request.id, object_path: path, original_name: "respaldo.pdf", mime_type: "application/pdf", size_bytes: 19, uploaded_by: users[clientName].id }), "attachment metadata");
  const submitted = await one(client.from("payment_requests").update({ status: "pending_approval" }).eq("id", request.id).select("*").single(), "submit request");
  return { ...submitted, path };
}

const own = await createRequest("worker", "HOC", 50000);
const ownVisible = await one(clients.worker.from("payment_requests").select("id").eq("id", own.id), "own visible");
assert(ownVisible.length === 1, "Trabajador crea y ve solicitud propia");
const foreign = await createRequest("administrator", "HOC", 60000);
const foreignVisible = await one(clients.worker.from("payment_requests").select("id").eq("id", foreign.id), "foreign hidden");
assert(foreignVisible.length === 0, "Trabajador no ve solicitudes ajenas");
const workerStep = await one(service.from("payment_request_approval_steps").select("id").eq("payment_request_id", own.id).single(), "own step");
const workerDecision = await clients.worker.rpc("decide_payment_request_approval_step", { target_step: workerStep.id, decision: "approve" });
expectError(workerDecision.error, "Trabajador no puede aprobar");

const adminUnits = await one(clients.administrator.from("payment_requests").select("business_unit_id"), "admin visibility");
assert(adminUnits.every((r) => [unit.HOC, unit.HOB].includes(r.business_unit_id)) && !adminUnits.some((r) => r.business_unit_id === unit.OM), "Administrador solo ve unidades asignadas");
await one(clients.administrator.rpc("decide_payment_request_approval_step", { target_step: workerStep.id, decision: "approve", decision_comment: "Aprobado" }), "admin approves");
const ownApproved = await one(service.from("payment_requests").select("status").eq("id", own.id).single(), "own approved");
assert(ownApproved.status === "approved", "Administrador aprueba etapa de su rol");

const seq = await createRequest("worker", "HOB", 200000, "advance");
let seqSteps = await one(service.from("payment_request_approval_steps").select("*").eq("payment_request_id", seq.id).order("sequence_order"), "sequential steps");
assert(seqSteps.length === 2, "Solicitud selecciona workflow correcto y congela etapas");
const financeEarly = await clients.finance_manager.rpc("decide_payment_request_approval_step", { target_step: seqSteps[1].id, decision: "approve" });
expectError(financeEarly.error, "Etapas secuenciales respetan orden");
await one(clients.administrator.rpc("decide_payment_request_approval_step", { target_step: seqSteps[0].id, decision: "approve" }), "sequential admin");
let seqStatus = await one(service.from("payment_requests").select("status").eq("id", seq.id).single(), "sequential pending");
assert(seqStatus.status === "pending_approval", "No aprueba hasta completar etapas obligatorias");
await one(service.from("approval_workflow_steps").update({ required_role_id: roleId.area_manager }).eq("id", sequential.steps[1].id), "mutate workflow config");
const frozenRole = await one(service.from("payment_request_approval_steps").select("required_role_id").eq("id", seqSteps[1].id).single(), "frozen role");
assert(frozenRole.required_role_id === roleId.finance_manager, "Cambiar configuración no altera instancia existente");
await one(clients.finance_manager.rpc("decide_payment_request_approval_step", { target_step: seqSteps[1].id, decision: "request_correction", decision_comment: "Corregir" }), "request correction");
await one(clients.worker.from("payment_requests").update({ status: "pending_approval" }).eq("id", seq.id), "resubmit correction");
const revisions = await one(service.from("payment_request_approval_instances").select("revision,status").eq("payment_request_id", seq.id).order("revision"), "revisions");
assert(revisions.length === 2 && revisions[1].revision === 2, "Corrección reinicia flujo restart_all");
seqSteps = await one(service.from("payment_request_approval_steps").select("*").eq("approval_instance_id", (await one(service.from("payment_requests").select("approval_instance_id").eq("id", seq.id).single(), "current instance")).approval_instance_id).order("sequence_order"), "revision steps");
assert(seqSteps.every((s) => s.status === "pending"), "Nueva revisión reinicia todas las etapas");
await one(clients.administrator.rpc("decide_payment_request_approval_step", { target_step: seqSteps[0].id, decision: "approve" }), "revision admin");
await one(clients.area_manager.rpc("decide_payment_request_approval_step", { target_step: seqSteps[1].id, decision: "approve" }), "revision manager after config change");
seqStatus = await one(service.from("payment_requests").select("status").eq("id", seq.id).single(), "sequential approved");
assert(seqStatus.status === "approved", "Solicitud se aprueba al completar todas las etapas");

const parallel = await createRequest("worker", "HOB", 80000, "reimbursement");
const parallelSteps = await one(service.from("payment_request_approval_steps").select("*").eq("payment_request_id", parallel.id), "parallel steps");
await one(clients.finance_manager.rpc("decide_payment_request_approval_step", { target_step: parallelSteps.find((s) => s.required_role_id === roleId.finance_manager).id, decision: "approve" }), "parallel finance first");
let parallelStatus = await one(service.from("payment_requests").select("status").eq("id", parallel.id).single(), "parallel pending");
assert(parallelStatus.status === "pending_approval", "Flujo paralelo espera todas las etapas obligatorias");
await one(clients.administrator.rpc("decide_payment_request_approval_step", { target_step: parallelSteps.find((s) => s.required_role_id === roleId.administrator).id, decision: "approve" }), "parallel admin second");
parallelStatus = await one(service.from("payment_requests").select("status").eq("id", parallel.id).single(), "parallel approved");
assert(parallelStatus.status === "approved", "Etapas paralelas funcionan correctamente");

const rejected = await createRequest("worker", "HOB", 90000, "reimbursement");
const rejectStep = await one(service.from("payment_request_approval_steps").select("id,required_role_id").eq("payment_request_id", rejected.id).eq("required_role_id", roleId.administrator).single(), "reject step");
await one(clients.administrator.rpc("decide_payment_request_approval_step", { target_step: rejectStep.id, decision: "reject", decision_comment: "Rechazo de prueba" }), "reject");
const rejectedState = await one(service.from("payment_requests").select("status").eq("id", rejected.id).single(), "rejected state");
assert(rejectedState.status === "rejected", "Rechazo cierra el flujo");

const noSub = await createRequest("worker", "HOB", 600000, "other");
const noSubStep = await one(service.from("payment_request_approval_steps").select("id").eq("payment_request_id", noSub.id).single(), "no substitute step");
expectError((await clients.general_manager.rpc("decide_payment_request_approval_step", { target_step: noSubStep.id, decision: "approve" })).error, "Gerente general no sustituye cuando está deshabilitado");
expectError((await clients.finance_manager.rpc("decide_payment_request_approval_step", { target_step: noSubStep.id, decision: "approve" })).error, "Finanzas no sustituye etapa de Gerente");
await one(service.from("approval_workflow_steps").update({ allow_higher_role_substitution: true }).eq("workflow_id", substitution.id), "enable substitution config");
expectError((await clients.general_manager.rpc("decide_payment_request_approval_step", { target_step: noSubStep.id, decision: "approve" })).error, "Instancia congelada conserva sustitución deshabilitada");
const subGg = await createRequest("worker", "HOB", 610000, "other");
const subGgStep = await one(service.from("payment_request_approval_steps").select("id").eq("payment_request_id", subGg.id).single(), "GG substitute step");
await one(clients.general_manager.rpc("decide_payment_request_approval_step", { target_step: subGgStep.id, decision: "approve", decision_comment: "Sustitución GG" }), "GG substitution");
const ggDecision = await one(service.from("payment_request_approval_decisions").select("acted_as_substitute,actual_role_id,required_role_id").eq("approval_step_id", subGgStep.id).single(), "GG decision");
assert(ggDecision.acted_as_substitute && ggDecision.actual_role_id === roleId.general_manager, "Sustitución de Gerente general queda registrada");
const subSuper = await createRequest("worker", "HOB", 620000, "other");
const subSuperStep = await one(service.from("payment_request_approval_steps").select("id").eq("payment_request_id", subSuper.id).single(), "super substitute step");
await one(clients.superadmin.rpc("decide_payment_request_approval_step", { target_step: subSuperStep.id, decision: "approve", decision_comment: "Sustitución Super" }), "super substitution");
const superDecision = await one(service.from("payment_request_approval_decisions").select("acted_as_substitute,actual_role_id").eq("approval_step_id", subSuperStep.id).single(), "super decision");
assert(superDecision.acted_as_substitute && superDecision.actual_role_id === roleId.superadmin, "Sustitución de Superadministrador queda registrada");

const ownDownload = await clients.worker.storage.from("payment-request-attachments").download(own.path);
assert(!ownDownload.error, "Usuario autorizado descarga respaldo privado");
const unauthorizedDownload = await clients.worker.storage.from("payment-request-attachments").download(foreign.path);
assert(Boolean(unauthorizedDownload.error), "Trabajador no descarga respaldo de solicitud ajena");
const crossCompanyUpload = await clients.worker.storage.from("payment-request-attachments").upload(`${otherCompany.id}/${otherUnit.id}/${crypto.randomUUID()}.pdf`, new Blob(["x"], { type: "application/pdf" }), { contentType: "application/pdf" });
assert(Boolean(crossCompanyUpload.error), "Usuario no sube archivos a otra empresa");

const payment = await one(clients.finance_manager.from("payments").insert({ company_id: company.id, business_unit_id: unit.HOC, payment_request_id: own.id, scheduled_date: new Date().toISOString().slice(0, 10), scheduled_by: users.finance_manager.id, created_by: users.finance_manager.id }).select("id").single(), "schedule payment");
await one(clients.finance_manager.from("payment_requests").update({ status: "scheduled" }).eq("id", own.id), "mark scheduled");
const receiptPath = `${company.id}/${payment.id}/${crypto.randomUUID()}.pdf`;
const receiptUpload = await clients.finance_manager.storage.from("payment-receipts").upload(receiptPath, new Blob(["%PDF receipt"], { type: "application/pdf" }), { contentType: "application/pdf" });
if (receiptUpload.error) throw receiptUpload.error;
await one(clients.finance_manager.from("payment_receipts").insert({ company_id: company.id, payment_id: payment.id, object_path: receiptPath, original_name: "comprobante.pdf", mime_type: "application/pdf", size_bytes: 12, uploaded_by: users.finance_manager.id }), "receipt metadata");
await one(clients.finance_manager.from("payments").update({ paid_at: new Date().toISOString(), method: "bank_transfer", operation_number: "TEST-001" }).eq("id", payment.id), "execute payment");
await one(clients.finance_manager.from("payment_requests").update({ status: "paid" }).eq("id", own.id), "request paid");

const workerDashboard = await one(clients.worker.rpc("executive_payment_summary", { date_from: "2020-01-01", date_to: "2200-01-01" }), "worker dashboard");
assert(Number(workerDashboard[0].total_requested) === 0, "Trabajador sin permiso no obtiene KPI");
const managerDashboard = await one(clients.area_manager.rpc("executive_payment_summary", { date_from: "2020-01-01", date_to: "2200-01-01" }), "manager dashboard");
assert(Number(managerDashboard[0].total_requested) > 0 && Number(managerDashboard[0].total_paid) === 50000, "Dashboard autorizado calcula solicitado y pagado");
const unitDashboard = await one(clients.area_manager.rpc("executive_payment_summary", { date_from: "2020-01-01", date_to: "2200-01-01", filter_company: company.id, filter_unit: unit.HOC }), "unit dashboard");
assert(Number(unitDashboard[0].total_paid) === 50000, "Dashboard filtra empresa y unidad autorizadas");
const otherDashboard = await one(clients.area_manager.rpc("executive_payment_summary", { date_from: "2020-01-01", date_to: "2200-01-01", filter_company: otherCompany.id, filter_unit: otherUnit.id }), "other dashboard");
assert(Number(otherDashboard[0].total_requested) === 0, "Dashboard no expone otra empresa");

const audit = await one(service.from("audit_logs").select("action,entity_type"), "audit logs");
assert(audit.some((a) => a.entity_type === "payment_requests") && audit.some((a) => a.entity_type === "payment_request_approval_decisions"), "Auditoría registra solicitudes y decisiones");

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
