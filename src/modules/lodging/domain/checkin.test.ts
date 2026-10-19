import { describe, expect, it } from "vitest";
import { checkinMessage, parseCheckinForm, whatsappNumber } from "./checkin";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const base = { full_name: "Juan Pérez", document: "12.345.678-9", nationality: "Chilena", email: "", phone: "+56 9 1111 1111", estimated_arrival: "15:30", estimated_departure: "11:00", license_plate: "", notes: "", accept_rules: "on" };

describe("check-in online", () => {
  it("valida el formulario y arma los acompañantes", () => {
    const r = parseCheckinForm(form({ ...base, companion_name_0: "Ana Soto", companion_document_0: "9.876.543-2", companion_name_1: "  " }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.companions).toEqual([{ full_name: "Ana Soto", document: "9.876.543-2" }]);
  });

  it("exige aceptar las normas y una hora válida", () => {
    expect(parseCheckinForm(form({ ...base, accept_rules: "" })).success).toBe(false);
    expect(parseCheckinForm(form({ ...base, estimated_arrival: "25:00" })).success).toBe(false);
    expect(parseCheckinForm(form({ ...base, estimated_departure: "9:5" })).success).toBe(false);
    expect(parseCheckinForm(form({ ...base, email: "no-es-correo" })).success).toBe(false);
  });

  it("arma el número de WhatsApp y el mensaje", () => {
    expect(whatsappNumber("9 1234 5678")).toBe("56912345678");
    expect(whatsappNumber("+56 9 1234 5678")).toBe("56912345678");
    expect(whatsappNumber("0")).toBeNull();
    expect(checkinMessage("Hostal Oasis Centro", "2026-10-20", "https://x/checkin/abc", "Juan Pérez")).toBe(
      "Hola Juan, te escribimos de Hostal Oasis Centro. Para agilizar tu llegada el 20-10-2026, completa tu check-in online aquí: https://x/checkin/abc",
    );
    expect(checkinMessage("H", "2026-10-20", "u", "Reserva Booking — información pendiente")).toMatch(/^Hola, /);
  });
});
