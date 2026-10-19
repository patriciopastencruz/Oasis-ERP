import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arrivalMessage, fillArrivalInfo, hostalGreetingName, needsRoomCode } from "./arrival-message";

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

describe("clave de la habitación en el texto del hostal", () => {
  const info = "🔑 Ingreso\n• Pasillo: 112233#\n• {habitacion}: {clave_habitacion}\n\n📶 WiFi: x";
  it("reemplaza la habitación y su clave", () => {
    expect(fillArrivalInfo(info, { name: "Pieza 4", code: "246227#" })).toContain("• Pieza 4: 246227#");
    expect(needsRoomCode(info)).toBe(true);
    expect(needsRoomCode("sin marcadores")).toBe(false);
  });
  it("sin clave cargada quita la línea en vez de enviar el marcador", () => {
    const out = fillArrivalInfo(info, { name: "Pieza 4", code: null });
    expect(out).not.toContain("{clave_habitacion}");
    expect(out).not.toContain("Pieza 4");
    expect(out).toContain("• Pasillo: 112233#");
  });
  it("el mensaje completo usa la habitación de la reserva", () => {
    const m = arrivalMessage({ unitCode: "HU", unitName: "x", info, roomName: "Pieza 4", roomCode: "246227#" });
    expect(m).toContain("• Pieza 4: 246227#");
    expect(arrivalMessage({ unitCode: "HU", unitName: "x", info, roomName: "Pieza 4" })).not.toContain("246227#");
  });
});

describe("mensaje según la fecha de llegada", () => {
  it("el mismo día dice 'Hoy es tu día de llegada', una llegada futura indica la fecha y una estadía en curso lo aclara", () => {
    const base = { unitCode: "HOC", unitName: "x" };
    expect(arrivalMessage({ ...base, checkIn: "2026-10-19", today: "2026-10-19" })).toContain("Hoy es tu día de llegada:");
    expect(arrivalMessage({ ...base, checkIn: "2026-10-25", today: "2026-10-19" })).toContain("Tu llegada es el 25-10-2026:");
    expect(arrivalMessage({ ...base, checkIn: "2026-10-15", today: "2026-10-19" })).toContain("Información de tu estadía:");
    expect(arrivalMessage(base)).toContain("Hoy es tu día de llegada:");
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

describe("migración de claves de habitaciones", () => {
  const sql = readFileSync("supabase/migrations/20261019160000_lodging_room_access_codes.sql", "utf8");
  it("protege la tabla con RLS y auditoría; leen quienes gestionan reservas y edita quien configura", () => {
    expect(sql).toContain("alter table public.lodging_room_access_codes enable row level security");
    expect(sql).toContain("revoke all on public.lodging_room_access_codes from public,anon,authenticated");
    expect(sql).toContain("audit_row_change");
    expect(sql).toContain("has_permission('lodging.reservations.manage')");
    expect(sql).toContain("has_permission('lodging.operations.configure')");
    expect(sql).not.toContain("using(true)");
  });
  it("no deja claves reales en la migración", () => {
    expect(sql).not.toMatch(/\d{6}#/);
  });
});
