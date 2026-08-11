import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260811120000_lodging_public_requests.sql",
  ),
  "utf8",
);

describe("contrato de solicitudes web públicas de reservas", () => {
  it("agrega public_web como origen válido", () => {
    expect(sql).toContain("'public_web'");
    expect(sql).toContain("lodging_reservations_origin_check");
  });
  it("agrega trazabilidad de revisión de staff", () => {
    expect(sql).toContain("reviewed_by uuid references auth.users(id)");
    expect(sql).toContain("reviewed_at timestamptz");
  });
  it("permite pagos y comprobantes sin actor staff", () => {
    expect(sql).toContain(
      "alter table public.lodging_reservation_payments\n  alter column registered_by drop not null",
    );
    expect(sql).toContain(
      "alter table public.lodging_payment_receipts\n  alter column uploaded_by drop not null",
    );
  });
  it("notifica al staff con un event_key que ya dispara el correo existente", () => {
    expect(sql).toContain("notify_lodging_public_request");
    expect(sql).toContain("'lodging.review_assigned'");
    expect(sql).toContain("'lodging_reservation'");
  });
  it("confirma/rechaza reserva y pago en una sola función security definer", () => {
    expect(sql).toContain(
      "review_lodging_public_request(\n  target_reservation uuid,\n  approve boolean\n)",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("has_permission('lodging.reservations.manage')");
    expect(sql).toContain("status = 'confirmed'");
  });
  it("no otorga acceso directo a anon", () => {
    expect(sql).not.toMatch(/grant[^;]*to\s+anon/i);
  });
});
