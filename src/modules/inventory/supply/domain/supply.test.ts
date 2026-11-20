import { describe, expect, it } from "vitest";
import {
  cleanRequestLines,
  consolidateRequests,
  defaultCoverWindow,
  formatCoverWindow,
  isRequestCancellable,
  isRequestEditable,
  parseQuantity,
  supplyErrorMessage,
} from "./supply";

describe("pedido de materiales del maestro", () => {
  it("propone los 2 días siguientes a hoy, también al cambiar de mes y de año", () => {
    expect(defaultCoverWindow("2026-11-20")).toEqual({ from: "2026-11-21", to: "2026-11-22" });
    expect(defaultCoverWindow("2026-11-30")).toEqual({ from: "2026-12-01", to: "2026-12-02" });
    expect(defaultCoverWindow("2026-12-31")).toEqual({ from: "2027-01-01", to: "2027-01-02" });
  });

  it("lee cantidades con coma o punto y rechaza cero, negativos y texto", () => {
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-3")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("1000000")).toBeNull();
  });

  it("descarta filas vacías y exige nombre y cantidad al resto", () => {
    const ok = cleanRequestLines([
      { material_id: "m1", quantity: "10" },
      { material_id: "", custom_name: "  ", quantity: "" },
      { custom_name: "Pintura roja", unit: "tarro", quantity: "2,5", note: "  brillante " },
    ]);
    expect(ok).toEqual({
      lines: [
        { material_id: "m1", quantity: 10 },
        { custom_name: "Pintura roja", unit: "tarro", quantity: 2.5, note: "brillante" },
      ],
    });
    expect(cleanRequestLines([{ material_id: "m1", quantity: "" }])).toEqual({ error: "Fila 1: indica una cantidad mayor que cero." });
    expect(cleanRequestLines([{ custom_name: "x", quantity: "1" }])).toEqual({ error: "Fila 1: elige un material o escribe su nombre." });
    expect(cleanRequestLines([{ material_id: "", quantity: "" }])).toEqual({ error: "Agrega al menos un material con su cantidad." });
  });

  it("un material fuera del catálogo sin unidad usa «un»", () => {
    expect(cleanRequestLines([{ custom_name: "Tornillos", quantity: "100" }])).toEqual({
      lines: [{ custom_name: "Tornillos", unit: "un", quantity: 100 }],
    });
  });

  it("se edita y se anula solo lo que todavía no está en una lista de compras", () => {
    expect(isRequestEditable("draft")).toBe(true);
    expect(isRequestEditable("submitted")).toBe(true);
    expect(isRequestEditable("in_list")).toBe(false);
    expect(isRequestEditable("cancelled")).toBe(false);
    expect(isRequestCancellable("draft")).toBe(true);
    expect(isRequestCancellable("submitted")).toBe(true);
    expect(isRequestCancellable("in_list")).toBe(false);
    expect(isRequestCancellable("cancelled")).toBe(false);
  });

  it("traduce los errores de la base a mensajes para el usuario y no filtra el resto", () => {
    expect(supplyErrorMessage("No tienes asignado ese proyecto")).toMatch(/asignado/);
    expect(supplyErrorMessage("El pedido cubre como maximo 7 dias")).toMatch(/7 días/);
    expect(supplyErrorMessage("Sin autorizacion")).toBe("No tienes autorización para esta acción.");
    expect(supplyErrorMessage('duplicate key value violates unique constraint "om_supply_requests_one_draft_idx"')).toBe(
      "No fue posible completar la operación. Intenta nuevamente.",
    );
  });

  it("muestra la ventana de días", () => {
    expect(formatCoverWindow("2026-11-21", "2026-11-22")).toBe("21-11 al 22-11");
    expect(formatCoverWindow("2026-11-21", "2026-11-21")).toBe("21-11");
  });

  it("consolida lo pedido por todos los maestros: suma por material y junta los de fuera de catálogo", () => {
    const items = consolidateRequests([
      {
        id: "r1",
        urgent: false,
        lines: [
          { id: "l1", material_id: "m1", name: "Volcanita", unit: "un", quantity: 30 },
          { id: "l2", material_id: null, name: "Pintura roja", unit: "tarro", quantity: 2 },
        ],
      },
      {
        id: "r2",
        urgent: true,
        lines: [
          { id: "l3", material_id: "m1", name: "Volcanita", unit: "un", quantity: 20.5 },
          { id: "l4", material_id: null, name: " pintura ROJA ", unit: "Tarro", quantity: 1 },
          { id: "l5", material_id: "m2", name: "Canal", unit: "un", quantity: 15 },
        ],
      },
    ]);
    expect(items.map((i) => [i.name, i.quantity, i.requests, i.urgent, i.lineId])).toEqual([
      ["Canal", 15, 1, true, "l5"],
      ["Pintura roja", 3, 2, true, "l2"],
      ["Volcanita", 50.5, 2, true, "l1"],
    ]);
    expect(consolidateRequests([])).toEqual([]);
  });
});
