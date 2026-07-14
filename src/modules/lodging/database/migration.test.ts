import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714003139_hostal_uruguay_reservations.sql",
  ),
  "utf8",
);
const tables = [
  "lodging_rooms",
  "lodging_guests",
  "lodging_reservations",
  "lodging_reservation_payments",
  "lodging_payment_receipts",
  "lodging_ical_configs",
  "lodging_ical_events",
  "lodging_sync_logs",
];

describe("contrato de base de Gestión de reservas", () => {
  it.each(tables)("crea %s", (table) =>
    expect(sql).toMatch(
      new RegExp(`create table public\\.${table}\\s*\\(`, "i"),
    ),
  );
  it.each(tables)("habilita RLS en %s", (table) =>
    expect(sql).toMatch(
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    ),
  );
  it("crea Hostal Uruguay", () =>
    expect(sql).toContain("'HU', 'Hostal Uruguay'"));
  it("protege cruces con rango semiabierto", () => {
    expect(sql).toContain("daterange(check_in, check_out, '[)')");
    expect(sql).toContain("exclude using gist");
  });
  it("mantiene comprobantes privados", () =>
    expect(sql).toMatch(
      /lodging-payment-receipts','lodging-payment-receipts',false/,
    ));
  it("limita comprobantes a 10 MB y MIME permitidos", () => {
    expect(sql).toContain("10485760");
    expect(sql).toContain("image/webp");
  });
  it("separa permisos de recepcionista y administrador", () => {
    expect(sql).toContain("lodging.payments.void");
    expect(sql).toContain("lodging.ical.configure");
    expect(sql).toContain("where r.key = 'receptionist'");
  });
  it("crea cinco habitaciones dinámicas", () =>
    expect(sql).toContain("generate_series(1,5)"));
  it("calcula pagos sin montos acumulados en la reserva", () => {
    expect(sql).toContain("lodging_payment_summary");
    expect(sql).toContain("type = 'refund'");
    expect(sql).toContain("status = 'confirmed'");
  });
  it("crea reserva y primer pago en una transacción RPC", () =>
    expect(sql).toContain("create_lodging_reservation(payload jsonb)"));
});
