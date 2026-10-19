import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arrivalMessage, hostalGreetingName } from "./arrival-message";

describe("mensaje de bienvenida del día de llegada", () => {
  it("usa el nombre del hostal sin la aclaración entre paréntesis", () => {
    expect(hostalGreetingName("HU", "x")).toBe("Hostal Atacama Oasis");
    expect(hostalGreetingName("HOC", "x")).toBe("Hostal Oasis Modulares");
    expect(hostalGreetingName("HOB", "x")).toBe("Hostal Oasis Cobija");
    expect(hostalGreetingName("ZZ", "Otro hostal")).toBe("Otro hostal");
  });

  it("incluye horarios, link de check-in y solo en Cobija el desayuno incluido", () => {
    const cobija = arrivalMessage({ unitCode: "HOB", unitName: "Hostal Oasis Cobija", guestName: "María José Pérez", checkinUrl: "https://www.oasis-erp.cl/checkin/abc" });
    expect(cobija).toContain("Hola María,");
    expect(cobija).toContain("bienvenida a Hostal Oasis Cobija");
    expect(cobija).toContain("Entrada desde las 14:00 y salida a las 12:00");
    expect(cobija).toContain("Tu desayuno está incluido");
    expect(cobija).toContain("https://www.oasis-erp.cl/checkin/abc");
    expect(arrivalMessage({ unitCode: "HOC", unitName: "x", checkinUrl: null })).not.toContain("desayuno");
    expect(arrivalMessage({ unitCode: "HU", unitName: "x" })).not.toContain("check-in online");
  });

  it("no usa los textos que Booking o Airbnb ponen como nombre y agrega la información de llegada del hostal", () => {
    const m = arrivalMessage({ unitCode: "HU", unitName: "x", guestName: "Reserva Booking 123", info: "Estamos en Calle 123.\nUbicación: https://maps.app/x" });
    expect(m.startsWith("Hola, ¡te damos")).toBe(true);
    expect(m).toContain("Estamos en Calle 123.");
    expect(m).toContain("Ubicación: https://maps.app/x");
    expect(m.trim().endsWith("¡Te esperamos!")).toBe(true);
  });
});

describe("migración de contactos de llegada", () => {
  const sql = readFileSync("supabase/migrations/20261019150000_lodging_arrival_contacts.sql", "utf8");
  it("protege las tablas con RLS, auditoría y sin escritura directa", () => {
    expect(sql).toContain("alter table public.lodging_arrival_contacts enable row level security");
    expect(sql).toContain("alter table public.lodging_arrival_info enable row level security");
    expect(sql).toContain("revoke all on public.lodging_arrival_contacts,public.lodging_arrival_info from public,anon,authenticated");
    expect(sql).toContain("audit_row_change");
    expect(sql).not.toContain("using(true)");
  });
  it("marcar un contacto exige gestionar reservas y editar el texto exige configurar la operación", () => {
    expect(sql).toContain("has_permission('lodging.reservations.manage')");
    expect(sql).toContain("has_permission('lodging.operations.configure')");
  });
});
