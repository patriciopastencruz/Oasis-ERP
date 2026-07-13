import { createClient } from "@supabase/supabase-js";
const { API_URL: url, PUBLISHABLE_KEY: key, SECRET_KEY: secret } = process.env;
if (!url || !key || !secret) throw new Error("Falta entorno local");
const service = createClient(url, secret, { auth: { persistSession: false } }),
  password = "Local-Test-Only-2026!";
const login = async (email) => {
    const c = createClient(url, key, { auth: { persistSession: false } });
    const r = await c.auth.signInWithPassword({ email, password });
    if (r.error) throw r.error;
    return c;
  },
  finance = await login("finance_manager@oasis.local.test"),
  worker = await login("worker@oasis.local.test"),
  results = [];
const ok = (v, n) => {
  if (!v) throw new Error(`FAIL ${n}`);
  results.push(n);
};
const one = async (p, n) => {
  const { data, error } = await p;
  if (error) throw new Error(`${n}: ${error.message}`);
  return data;
};
const approved = await one(
  service
    .from("payment_requests")
    .select("id,company_id,amount,status")
    .eq("status", "approved")
    .limit(1)
    .single(),
  "solicitud aprobada",
);
const denied = await worker.rpc("schedule_payment", {
  target_request: approved.id,
  target_date: "2026-08-01",
  target_method: "bank_transfer",
});
ok(Boolean(denied.error), "Usuario sin permiso no programa");
const concurrent = await Promise.all([
  finance.rpc("schedule_payment", {
    target_request: approved.id,
    target_date: "2026-08-01",
    target_method: "bank_transfer",
    schedule_notes: "Prueba local 4C",
  }),
  finance.rpc("schedule_payment", {
    target_request: approved.id,
    target_date: "2026-08-01",
    target_method: "bank_transfer",
    schedule_notes: "Prueba local 4C",
  }),
]);
ok(
  concurrent.every((x) => !x.error),
  "Programación concurrente es idempotente",
);
const payments = await one(
  service
    .from("payments")
    .select("id,paid_at")
    .eq("payment_request_id", approved.id),
  "pagos",
);
ok(payments.length === 1, "Existe un único pago por solicitud");
const payment = payments[0];
const noReceipt = await finance.rpc("execute_payment", {
  target_payment: payment.id,
  target_paid_at: new Date().toISOString(),
  target_method: "bank_transfer",
  target_operation_number: "LOCAL-4C",
  target_amount: approved.amount,
});
ok(Boolean(noReceipt.error), "Ejecución exige comprobante");
const path = `${approved.company_id}/${payment.id}/${crypto.randomUUID()}.pdf`;
await one(
  finance.storage
    .from("payment-receipts")
    .upload(path, new Blob(["%PDF local 4C"], { type: "application/pdf" }), {
      contentType: "application/pdf",
    }),
  "upload",
);
const user = (await finance.auth.getUser()).data.user;
await one(
  finance
    .from("payment_receipts")
    .insert({
      company_id: approved.company_id,
      payment_id: payment.id,
      object_path: path,
      original_name: "local-4c.pdf",
      mime_type: "application/pdf",
      size_bytes: 13,
      uploaded_by: user.id,
    }),
  "metadata",
);
const wrong = await finance.rpc("execute_payment", {
  target_payment: payment.id,
  target_paid_at: new Date().toISOString(),
  target_method: "bank_transfer",
  target_operation_number: "LOCAL-4C",
  target_amount: Number(approved.amount) + 1,
});
ok(Boolean(wrong.error), "Monto distinto es rechazado");
const executed = await finance.rpc("execute_payment", {
  target_payment: payment.id,
  target_paid_at: new Date().toISOString(),
  target_method: "bank_transfer",
  target_operation_number: "LOCAL-4C",
  target_amount: approved.amount,
});
ok(!executed.error, "Pago con comprobante se ejecuta");
const repeated = await finance.rpc("execute_payment", {
  target_payment: payment.id,
  target_paid_at: new Date().toISOString(),
  target_method: "bank_transfer",
  target_operation_number: "LOCAL-4C",
  target_amount: approved.amount,
});
ok(
  !repeated.error && repeated.data.already_paid,
  "Doble ejecución devuelve pago existente",
);
const final = await one(
  service
    .from("payment_requests")
    .select("status")
    .eq("id", approved.id)
    .single(),
  "estado final",
);
ok(final.status === "paid", "Ejecución cambia solicitud a paid");
const audit = await one(
  service
    .from("audit_logs")
    .select("id")
    .in("entity_type", ["payments", "payment_requests"]),
  "auditoría",
);
ok(audit.length > 0, "Auditoría registra programación y ejecución");
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
