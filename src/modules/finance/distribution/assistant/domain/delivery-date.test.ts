import { describe, expect, it } from "vitest";
import { candidateDates, validateDeliveryDate } from "./delivery-date";

// 2026-10-26 es lunes.
const today = "2026-10-26";

describe("fecha de entrega dicha por el cliente", () => {
  it("entiende hoy, mañana y pasado mañana", () => {
    expect([...candidateDates("necesito para hoy", today)]).toEqual(["2026-10-26"]);
    expect([...candidateDates("lo quiero para mañana", today)]).toEqual(["2026-10-27"]);
    expect([...candidateDates("para pasado mañana por favor", today)]).toEqual(["2026-10-28"]);
  });

  it("entiende el día de la semana como la próxima vez que cae", () => {
    expect([...candidateDates("el viernes", today)]).toEqual(["2026-10-30"]);
    // Hoy es lunes: «el lunes» puede ser hoy o el de la semana siguiente.
    expect([...candidateDates("el lunes", today)].sort()).toEqual(["2026-10-26", "2026-11-02"]);
  });

  it("entiende fechas con número", () => {
    expect(candidateDates("para el 30 de octubre", today).has("2026-10-30")).toBe(true);
    expect(candidateDates("el 3 de noviembre", today).has("2026-11-03")).toBe(true);
    expect(candidateDates("el 30/10", today).has("2026-10-30")).toBe(true);
    expect(candidateDates("el 29", today).has("2026-10-29")).toBe(true);
    // Un mes que ya pasó se entiende del año siguiente.
    expect(candidateDates("el 5 de enero", today).has("2027-01-05")).toBe(true);
  });

  it("acepta una fecha igual a la que dijo el cliente y rechaza una distinta", () => {
    expect(validateDeliveryDate("2026-10-27", "para mañana", today)).toBeNull();
    expect(validateDeliveryDate("2026-10-28", "para mañana", today)).toMatch(/no coincide/);
  });

  it("si no hay una fecha reconocible no puede contradecirla", () => {
    expect(validateDeliveryDate("2026-10-27", "quiero 10 bolsas", today)).toBeNull();
  });
});
