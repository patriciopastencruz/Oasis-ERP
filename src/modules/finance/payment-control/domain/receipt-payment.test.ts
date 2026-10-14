import { describe, expect, it } from "vitest";
import {
  localInputToIso,
  operationNumberFor,
  paymentMethodFromReading,
  receiptAmountMatches,
  santiagoDateTimeToIso,
} from "./receipt-payment";

const NOW = new Date("2026-10-14T20:00:00Z"); // 17:00 en Santiago (UTC-3)

describe("pago a partir del comprobante", () => {
  it("compara el monto leído con el aprobado", () => {
    expect(receiptAmountMatches(150000, 150000)).toBe(true);
    expect(receiptAmountMatches(150001, 150000)).toBe(true);
    expect(receiptAmountMatches(149000, 150000)).toBe(false);
    expect(receiptAmountMatches(null, 150000)).toBeNull();
  });

  it("elige el medio por el comprobante y, si no, por la solicitud", () => {
    expect(paymentMethodFromReading("card", true)).toBe("card");
    expect(paymentMethodFromReading("transfer", false)).toBe("bank_transfer");
    expect(paymentMethodFromReading(null, true)).toBe("bank_transfer");
    expect(paymentMethodFromReading(null, false)).toBe("cash");
  });

  it("convierte la fecha y hora de Santiago a UTC con el horario vigente", () => {
    // Octubre: horario de verano (UTC-3).
    expect(santiagoDateTimeToIso("2026-10-10", "15:30", NOW)).toBe("2026-10-10T18:30:00.000Z");
    // Junio: horario de invierno (UTC-4).
    expect(santiagoDateTimeToIso("2026-06-10", "15:30", NOW)).toBe("2026-06-10T19:30:00.000Z");
  });

  it("sin hora usa el mediodía y nunca una fecha futura", () => {
    expect(santiagoDateTimeToIso("2026-10-10", null, NOW)).toBe("2026-10-10T15:00:00.000Z");
    expect(santiagoDateTimeToIso("2026-10-14", "23:00", NOW)).toBe(NOW.toISOString());
  });

  it("lee el valor de un input datetime-local", () => {
    expect(localInputToIso("2026-10-10T15:30", NOW)).toBe("2026-10-10T18:30:00.000Z");
    expect(localInputToIso("basura", NOW)).toBeNull();
  });

  it("deja constancia cuando no se lee el número de operación", () => {
    expect(operationNumberFor("bank_transfer", "123456")).toEqual({ value: "123456", placeholder: false });
    expect(operationNumberFor("bank_transfer", null)).toEqual({ value: "S/N (ver comprobante)", placeholder: true });
    expect(operationNumberFor("cash", null)).toEqual({ value: null, placeholder: false });
  });
});
