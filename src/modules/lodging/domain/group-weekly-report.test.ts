import { describe, expect, it } from "vitest";
import { pendingBalances, pendingClosingDates, staffActivity } from "./group-weekly-report";

describe("reporte semanal de hostales", () => {
  it("cierres pendientes sin contar el día de hoy", () => {
    expect(pendingClosingDates("2026-10-01", "2026-10-05", ["2026-10-01", "2026-10-03"], "2026-10-14")).toEqual([
      "2026-10-02",
      "2026-10-04",
      "2026-10-05",
    ]);
    expect(pendingClosingDates("2026-10-01", "2026-10-14", ["2026-10-01", "2026-10-02"], "2026-10-03")).toEqual([]);
    expect(pendingClosingDates("2026-10-01", "2026-10-14", [], "2026-10-01")).toEqual([]);
  });

  it("saldos por cobrar con devoluciones y pagos anulados", () => {
    const base = { room: "1", guest: null, check_in: "2026-10-02", check_out: "2026-10-04", postpaid_company: false };
    const r = pendingBalances([
      { ...base, id: "a", total_value: 100, payments: [{ amount: 100, type: "total", status: "confirmed" }] },
      { ...base, id: "b", total_value: 100, payments: [{ amount: 60, type: "deposit", status: "confirmed" }, { amount: 40, type: "balance", status: "voided" }] },
      { ...base, id: "c", total_value: 50, postpaid_company: true, payments: [{ amount: 50, type: "total", status: "confirmed" }, { amount: 20, type: "refund", status: "confirmed" }] },
    ]);
    expect(r.rows.map((x) => [x.id, x.balance])).toEqual([["b", 40], ["c", 20]]);
    expect([r.total, r.postpaid]).toEqual([60, 20]);
  });

  it("gestión por recepcionista", () => {
    const rows = staffActivity({
      names: new Map([["u1", "Carla"], ["u2", "Diego"]]),
      reservations: [{ created_by: "u1" }, { created_by: "u1" }, { created_by: null }],
      payments: [
        { registered_by: "u2", amount: 30000, type: "total" },
        { registered_by: "u2", amount: 5000, type: "refund" },
        { registered_by: "u1", amount: 10000, type: "deposit" },
      ],
      closings: [{ issued_by: "u2" }, { issued_by: "u3" }],
    });
    expect(rows).toEqual([
      { userId: "u1", name: "Carla", reservations: 2, payments: 1, collected: 10000, closings: 0 },
      { userId: "u2", name: "Diego", reservations: 0, payments: 2, collected: 25000, closings: 1 },
      { userId: "u3", name: "Usuario", reservations: 0, payments: 0, collected: 0, closings: 1 },
    ]);
  });
});
