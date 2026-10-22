import { describe, expect, it } from "vitest";
import { isOutOfServiceOn, serviceGaps } from "./room-service";

const ev = (room_id: string, from_status: string | null, to_status: string, created_at: string) => ({ room_id, from_status, to_status, created_at });

describe("períodos fuera de servicio de una habitación", () => {
  it("una habitación sin cambios y en servicio no tiene períodos", () => {
    expect(serviceGaps([{ id: "a", status: "available" }], [])).toEqual({});
  });

  it("sale de servicio el 20 a las 16:41 y sigue fuera: cuenta desde ese día", () => {
    const gaps = serviceGaps(
      [{ id: "a", status: "out_of_service", updated_at: "2026-10-20T19:41:44Z" }],
      [ev("a", "inspected", "out_of_service", "2026-10-20T19:41:44Z")],
    );
    expect(gaps.a).toEqual([{ from: "2026-10-20", to: null }]);
    expect(isOutOfServiceOn(gaps.a, "2026-10-19")).toBe(false);
    expect(isOutOfServiceOn(gaps.a, "2026-10-20")).toBe(true);
    expect(isOutOfServiceOn(gaps.a, "2026-10-25")).toBe(true);
  });

  it("sale y vuelve a servicio: solo esos días están fuera", () => {
    const gaps = serviceGaps(
      [{ id: "a", status: "available" }],
      [ev("a", "available", "maintenance", "2026-10-05T15:00:00Z"), ev("a", "maintenance", "dirty", "2026-10-08T15:00:00Z")],
    );
    expect(gaps.a).toEqual([{ from: "2026-10-05", to: "2026-10-08" }]);
    expect(isOutOfServiceOn(gaps.a, "2026-10-04")).toBe(false);
    expect(isOutOfServiceOn(gaps.a, "2026-10-05")).toBe(true);
    expect(isOutOfServiceOn(gaps.a, "2026-10-07")).toBe(true);
    expect(isOutOfServiceOn(gaps.a, "2026-10-08")).toBe(false);
  });

  it("pasar de mantención a fuera de servicio mantiene el mismo período", () => {
    const gaps = serviceGaps(
      [{ id: "a", status: "out_of_service" }],
      [ev("a", "available", "maintenance", "2026-10-05T15:00:00Z"), ev("a", "maintenance", "out_of_service", "2026-10-06T15:00:00Z")],
    );
    expect(gaps.a).toEqual([{ from: "2026-10-05", to: null }]);
  });

  it("si hoy está fuera de servicio y no hay historial, se toma desde su última modificación", () => {
    const gaps = serviceGaps([{ id: "a", status: "out_of_service", updated_at: "2026-10-12T15:00:00Z" }], []);
    expect(gaps.a).toEqual([{ from: "2026-10-12", to: null }]);
  });
});
