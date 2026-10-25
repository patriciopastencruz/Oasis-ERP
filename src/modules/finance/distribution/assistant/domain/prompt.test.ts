import { describe, expect, it } from "vitest";
import { DIST_BASE_RULES, buildDistContextNote } from "./prompt";

const base = {
  today: "lunes, 26 de octubre de 2026",
  todayIso: "2026-10-26",
  products: [
    { code: "ICE-2KG", name: "Hielo cubo 2 kg", price: 450 },
    { code: "WATER-20L", name: "Agua 20 litros", price: null },
  ],
  weekdays: [1, 2, 3, 4, 5, 6],
  cutoff: "12:00",
  recent: [{ number: "DA-2026-000100", date: "2026-10-20", status: "entregado", total: 9000, lines: "20 × Hielo cubo 2 kg" }],
  contactName: "Juan",
};

describe("contexto del asistente de pedidos", () => {
  it("para un cliente registrado trae sus precios, crédito y pedidos recientes", () => {
    const note = buildDistContextNote({
      ...base,
      customers: [{ id: "c1", code: "CLI-1", name: "Minimarket Sol", address: "Calle 1", classification: "Minimarket", hasCredit: false, creditAvailable: false }],
      chosenCustomerId: "c1",
    });
    expect(note).toContain("Cliente registrado: Minimarket Sol");
    expect(note).toContain("ICE-2KG · Hielo cubo 2 kg: $450");
    expect(note).toContain("No tiene crédito");
    expect(note).toContain("Sin precio para este cliente (no los ofrezcas): Agua 20 litros");
    expect(note).toContain("DA-2026-000100");
    expect(note).toContain("lunes, martes, miércoles, jueves, viernes, sábado");
  });

  it("para un número desconocido no muestra precios", () => {
    const note = buildDistContextNote({ ...base, customers: [], chosenCustomerId: null });
    expect(note).toContain("Cliente NO registrado");
    expect(note).not.toContain("$450");
  });

  it("si el número tiene varios clientes pide elegir", () => {
    const note = buildDistContextNote({
      ...base,
      customers: [
        { id: "c1", code: "CLI-1", name: "Bar A", address: "Calle 1", classification: "Bar", hasCredit: false, creditAvailable: false },
        { id: "c2", code: "CLI-2", name: "Bar B", address: "Calle 2", classification: "Bar", hasCredit: false, creditAvailable: false },
      ],
      chosenCustomerId: null,
    });
    expect(note).toContain("varios clientes registrados");
    expect(note).toContain("customer_id c2");
  });

  it("las reglas obligan a confirmar antes de crear y a no inventar precios", () => {
    expect(DIST_BASE_RULES).toContain("¿Confirmas el pedido?");
    expect(DIST_BASE_RULES).toContain("Nunca inventes precios");
    expect(DIST_BASE_RULES).toContain("CLIENTES NO REGISTRADOS");
  });
});
