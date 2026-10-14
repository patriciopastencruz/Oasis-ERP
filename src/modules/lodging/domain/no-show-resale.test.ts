import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closingExtras, executiveContext, type ClosingMetrics } from "./daily-closing";
import { rangeOperations } from "./monthly-closing";

const rooms = [
  { id: "r1", name: "Pieza 1", room_type: "Simple", display_order: 1 },
  { id: "r2", name: "Pieza 2", room_type: "Simple", display_order: 2 },
];

describe("reventa: cada reserva activa cuenta como una ocupación", () => {
  it("la reserva pagada que no llegó y la reventa suman ocupación y venta", () => {
    // Pieza 1: reserva de Airbnb pagada (no llegó) + reventa manual la misma noche.
    const ops = rangeOperations(
      "2026-10-14",
      "2026-10-14",
      rooms,
      [
        { room_id: "r1", check_in: "2026-10-14", check_out: "2026-10-15", total_value: 30000 },
        { room_id: "r1", check_in: "2026-10-14", check_out: "2026-10-15", total_value: 25000 },
        { room_id: "r2", check_in: "2026-10-14", check_out: "2026-10-15", total_value: 20000 },
      ],
      [],
      "2026-10-14",
    );
    expect(ops.days[0].occupied).toBe(3); // 3 reservas en 2 habitaciones
    expect(ops.occupancy).toBe(1.5); // 150%
    expect(ops.revenue).toBe(75000);
    expect(ops.rooms.find((r) => r.name === "Pieza 1")?.nights).toBe(2);
  });

  it("sin reventa el cálculo es el de siempre", () => {
    const ops = rangeOperations(
      "2026-10-14",
      "2026-10-14",
      rooms,
      [{ room_id: "r1", check_in: "2026-10-14", check_out: "2026-10-15", total_value: 25000 }],
      [],
      "2026-10-14",
    );
    expect(ops.days[0].occupied).toBe(1);
    expect(ops.occupancy).toBe(0.5);
  });
});

describe("cierre diario con ocupación sobre 100%", () => {
  const metrics = {
    availability_10d: [{ date: "2026-10-14", total: 7, occupied: 8 }],
  } as unknown as ClosingMetrics;

  it("muestra el % real pero limita la barra a 100", () => {
    const [day] = closingExtras(metrics).availability;
    expect(Math.round(day.occupiedPct)).toBe(114);
    expect(day.occupiedBar).toBe(100);
    expect(day.availablePct).toBe(0);
  });

  it("las libres promedio del mes nunca quedan negativas", () => {
    const ctx = executiveContext(
      { closing_date: "2026-10-14", total_received: 0, expense_total: 0, occupied_rooms: 8, total_rooms: 7 },
      [],
    );
    expect(ctx.month.availablePerDay).toBe(0);
    expect(ctx.month.occupancy).toBeGreaterThan(100);
  });
});

describe("migración de no-show sin pago y reventa", () => {
  const sql = readFileSync(
    "supabase/migrations/20261014200000_lodging_no_show_unpaid_resale_counts.sql",
    "utf8",
  );
  it("el no-show se rechaza si la reserva tiene pagos", () => {
    expect(sql).toContain("if v_paid>0 then raise exception");
    expect(sql).toContain("revoke execute on function public.lodging_mark_no_show(uuid,text) from public,anon");
  });
  it("la ocupación cuenta reservas activas y no habitaciones distintas", () => {
    expect(sql).toContain("(select count(*) from stays)::int as occupied_rooms");
    expect(sql).toContain("'resold_rooms'");
    expect(sql).not.toContain("no_show_retained and");
  });
});
