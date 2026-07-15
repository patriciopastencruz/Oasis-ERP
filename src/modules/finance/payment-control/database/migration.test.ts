import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = [
  "supabase/migrations/20260715141306_payment_request_cancellation.sql",
  "supabase/migrations/20260715151043_honor_resume_current_correction_policy.sql",
]
  .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
  .join("\n");

describe("anulación de solicitudes de pago aprobadas", () => {
  it("exige permiso de Finanzas y motivo obligatorio, sin borrar el registro", () => {
    expect(sql).toContain(
      "function public.cancel_payment_request(target_id uuid,reason text)",
    );
    expect(sql).toContain("has_permission('finance.payments.manage')");
    expect(sql).toContain("length(trim(coalesce(reason,''))) < 3");
    expect(sql).not.toContain("delete from public.payment_requests");
  });

  it("solo permite anular solicitudes aprobadas o programadas", () => {
    expect(sql).toContain(
      "if r.status not in ('approved','scheduled') then raise exception using errcode='P0001',message='Solo se pueden anular solicitudes aprobadas o programadas'",
    );
  });
});

describe("política de corrección resume_current", () => {
  it("solo aplica al reenviar desde correction_requested con resume_current", () => {
    expect(sql).toContain(
      "resuming := old.status = 'correction_requested'\n    and selected.correction_policy = 'resume_current'",
    );
  });

  it("traslada aprobadas las etapas ya decididas en la revisión anterior", () => {
    expect(sql).toContain(
      "left join public.payment_request_approval_steps prior",
    );
    expect(sql).toContain(
      "when resuming and prior.status = 'approved' then 'approved'::public.approval_step_status",
    );
    expect(sql).toContain("prior.decided_by");
    expect(sql).toContain("prior.decided_at");
  });

  it("restart_all conserva su comportamiento de reinicio total", () => {
    expect(sql).toContain("set status = 'skipped'");
    expect(sql).toContain("set status = 'cancelled', completed_at = now()");
  });
});
