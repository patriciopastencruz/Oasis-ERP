import { describe, expect, it } from "vitest";
import {
  generateIcal,
  rateForGuests,
  ratesFromForm,
  nights,
  overlaps,
  parseIcal,
  paymentSummary,
  totalForStay,
} from "./reservations";

describe("reservas", () => {
  it("cuenta noches sin ocupar el día de salida", () =>
    expect(nights("2026-07-15", "2026-07-18")).toBe(3));
  it("permite entrar el día de un check-out", () =>
    expect(
      overlaps("2026-07-18", "2026-07-20", "2026-07-15", "2026-07-18"),
    ).toBe(false));
  it("calcula tarifa, descuento y recargo", () =>
    expect(
      totalForStay({
        checkIn: "2026-07-15",
        checkOut: "2026-07-18",
        nightlyRate: 35000,
        discount: 5000,
        surcharge: 2000,
      }),
    ).toBe(102000));
  it("excluye anulados y resta devoluciones", () =>
    expect(
      paymentSummary(100000, [
        { amount: 60000, type: "partial", status: "confirmed" },
        { amount: 30000, type: "partial", status: "voided" },
        { amount: 10000, type: "refund", status: "confirmed" },
      ]),
    ).toEqual({
      paid: 50000,
      balance: 50000,
      status: "Reembolsado parcialmente",
    }));
  it("importa VEVENT sin duplicar lógica comercial", () =>
    expect(
      parseIcal(
        "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a-1\r\nDTSTART;VALUE=DATE:20260715\r\nDTEND;VALUE=DATE:20260718\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR",
      )[0],
    ).toMatchObject({ uid: "a-1", start: "2026-07-15", end: "2026-07-18" }));
  it("exporta solo disponibilidad", () => {
    const ics = generateIcal("P1", [
      { id: "r1", check_in: "2026-07-15", check_out: "2026-07-18" },
    ]);
    expect(ics).toContain("SUMMARY:No disponible");
    expect(ics).not.toContain("huésped");
  });
  it("procesa STATUS:CANCELLED", () =>
    expect(
      parseIcal(
        "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:c-1\r\nDTSTART;VALUE=DATE:20260715\r\nDTEND;VALUE=DATE:20260718\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR",
      )[0].status,
    ).toBe("CANCELLED"));
  it("rechaza salida anterior", () =>
    expect(() => nights("2026-07-18", "2026-07-15")).toThrow("posterior"));
  it("rechaza total negativo", () =>
    expect(() =>
      totalForStay({
        checkIn: "2026-07-15",
        checkOut: "2026-07-16",
        nightlyRate: 1000,
        discount: 2000,
      }),
    ).toThrow("negativo"));
  it("identifica pago total", () =>
    expect(
      paymentSummary(100, [{ amount: 100, type: "total", status: "confirmed" }])
        .status,
    ).toBe("Pagado"));
  it("identifica pago excedido", () =>
    expect(
      paymentSummary(100, [{ amount: 120, type: "total", status: "confirmed" }])
        .status,
    ).toBe("Pago excedido"));
  it("identifica reembolso total", () =>
    expect(
      paymentSummary(100, [
        { amount: 100, type: "total", status: "confirmed" },
        { amount: 100, type: "refund", status: "confirmed" },
      ]).status,
    ).toBe("Reembolsado totalmente"));
});

describe("tarifas por cantidad de personas", () => {
  const mini = { base_rate: 27000, rates_by_guests: { "1": 27000, "2": 32000, "3": 36000 } };
  it("usa la tarifa de la cantidad de personas", () => {
    expect([1, 2, 3].map((g) => rateForGuests(mini, g))).toEqual([27000, 32000, 36000]);
  });
  it("sin tarifa exacta usa la de la mayor cantidad definida, y sin tarifas la base", () => {
    expect(rateForGuests(mini, 4)).toBe(36000);
    expect(rateForGuests({ base_rate: 24000, rates_by_guests: { "2": 29000 } }, 1)).toBe(29000);
    expect(rateForGuests({ base_rate: "35000", rates_by_guests: null }, 2)).toBe(35000);
  });
  it("lee las tarifas del formulario", () => {
    const form = new Map<string, string>([["rate_1", "$27.000"], ["rate_2", "32000"], ["rate_3", ""]]);
    expect(ratesFromForm((k) => form.get(k) ?? null)).toEqual({ "1": 27000, "2": 32000 });
    expect(ratesFromForm(() => null)).toBeNull();
  });
});
