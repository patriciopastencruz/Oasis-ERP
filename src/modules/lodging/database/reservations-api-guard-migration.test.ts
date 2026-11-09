import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("control de escrituras directas a reservas", () => {
  const sql = readFileSync("supabase/migrations/20261109143154_lodging_reservations_api_guard.sql", "utf8");

  it("solo aplica a escrituras directas por la API", () => {
    expect(sql).toContain("if current_user not in('authenticated','anon') then return new; end if;");
    expect(sql).toContain("create trigger lodging_reservation_api_guard before insert or update on public.lodging_reservations");
  });

  it("protege estado, marcas y total, y valida el cambio de habitación", () => {
    expect(sql).toContain("raise exception 'Ese cambio se hace desde las acciones de la reserva'");
    expect(sql).toContain("raise exception 'El total no corresponde a la tarifa de la reserva'");
    expect(sql).toContain("raise exception 'Habitacion no valida para esta reserva'");
  });

  it("audita el cambio de habitación y ata el comprobante al hostal del pago", () => {
    expect(sql).toContain("'change_room','lodging_reservations'");
    expect(sql).toContain("raise exception 'El comprobante debe ser del mismo hostal que el pago'");
  });

  it("va dentro de una transacción", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
