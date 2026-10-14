import { describe, expect, it } from "vitest";
import { averageStay, cancellationStats, futureOccupancy } from "./report-indicators";

const stay = (room_id: string, check_in: string, check_out: string) => ({ room_id, check_in, check_out });

describe("averageStay", () => {
  it("promedia noches de las llegadas dentro del rango", () => {
    const r = averageStay(
      [stay("a", "2026-10-02", "2026-10-04"), stay("b", "2026-10-05", "2026-10-10"), stay("c", "2026-09-30", "2026-10-03")],
      "2026-10-01",
      "2026-10-13",
    );
    expect(r).toEqual({ average: 3.5, reservations: 2 });
  });
  it("sin llegadas no inventa un promedio", () => {
    expect(averageStay([], "2026-10-01", "2026-10-13")).toEqual({ average: null, reservations: 0 });
  });
});

describe("futureOccupancy", () => {
  const rooms = new Set(["a", "b"]);
  it("cuenta noches reservadas desde hoy sobre habitaciones vendibles", () => {
    const r = futureOccupancy(
      [stay("a", "2026-10-13", "2026-10-15"), stay("b", "2026-10-14", "2026-10-20"), stay("z", "2026-10-13", "2026-10-30")],
      rooms,
      "2026-10-13",
      [2, 7],
    );
    expect(r[0]).toMatchObject({ days: 2, nights: 3, available: 4 });
    expect(r[1]).toMatchObject({ days: 7, nights: 8, available: 14 });
    expect(r[0].pct).toBeCloseTo(0.75);
  });
  it("una habitación con reservas superpuestas cuenta una sola vez por noche", () => {
    const r = futureOccupancy(
      [stay("a", "2026-10-13", "2026-10-15"), stay("a", "2026-10-13", "2026-10-15")],
      rooms,
      "2026-10-13",
      [2],
    );
    expect(r[0].nights).toBe(2);
  });
  it("ignora lo que ya terminó antes de hoy", () => {
    const r = futureOccupancy([stay("a", "2026-10-01", "2026-10-13")], rooms, "2026-10-13", [7]);
    expect(r[0].nights).toBe(0);
  });
});

describe("cancellationStats", () => {
  const r = (room_id: string, check_in: string, check_out: string, status: string, origin = "direct", total_value = 100_000) => ({
    room_id, check_in, check_out, status, origin, total_value,
  });
  it("calcula tasa por canal y noches perdidas", () => {
    const s = cancellationStats(
      [
        r("a", "2026-10-02", "2026-10-04", "cancelled", "booking", 80_000),
        r("b", "2026-10-03", "2026-10-06", "confirmed", "booking"),
        r("c", "2026-10-05", "2026-10-06", "checked_out", "direct"),
        r("d", "2026-10-07", "2026-10-09", "cancelled", "direct", 50_000),
      ],
      "2026-10-01",
      "2026-10-13",
    );
    expect(s).toMatchObject({ reservations: 4, cancelled: 2, replaced: 0, lostNights: 4, lostValue: 130_000 });
    expect(s.rate).toBeCloseTo(0.5);
    expect(s.byOrigin.find((o) => o.origin === "booking")).toMatchObject({ reservations: 2, cancelled: 1, lostNights: 2 });
  });
  it("una cancelada que se volvió a vender no cuenta como noche perdida", () => {
    const s = cancellationStats(
      [r("a", "2026-10-02", "2026-10-05", "cancelled"), r("a", "2026-10-03", "2026-10-06", "confirmed")],
      "2026-10-01",
      "2026-10-13",
    );
    expect(s).toMatchObject({ cancelled: 1, replaced: 1, lostNights: 0, lostValue: 0 });
  });
  it("ignora conflictos y llegadas fuera del rango", () => {
    const s = cancellationStats(
      [r("a", "2026-10-02", "2026-10-03", "conflict"), r("b", "2026-11-02", "2026-11-03", "cancelled")],
      "2026-10-01",
      "2026-10-13",
    );
    expect(s.reservations).toBe(0);
    expect(s.rate).toBe(0);
  });
});
