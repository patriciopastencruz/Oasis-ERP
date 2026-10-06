import { describe, expect, it } from "vitest";
import {
  balanceStage,
  netConfirmedPayments,
  outstandingBalance,
  overdueDays,
} from "./outstanding-balances";

describe("reporte de saldos pendientes", () => {
  const payments = [
    { amount: 40_000, type: "deposit", status: "confirmed" },
    { amount: 5_000, type: "refund", status: "confirmed" },
    { amount: 10_000, type: "partial", status: "voided" },
  ];

  it("calcula pagos netos considerando devoluciones y anulaciones", () => {
    expect(netConfirmedPayments(payments)).toBe(35_000);
    expect(outstandingBalance(100_000, payments)).toBe(65_000);
  });

  it("clasifica reservas vencidas, en curso y próximas", () => {
    expect(balanceStage("2026-10-01", "2026-10-05", "2026-10-06")).toBe(
      "overdue",
    );
    expect(balanceStage("2026-10-05", "2026-10-08", "2026-10-06")).toBe(
      "current",
    );
    expect(balanceStage("2026-10-05", "2026-10-06", "2026-10-06")).toBe(
      "current",
    );
    expect(balanceStage("2026-10-08", "2026-10-10", "2026-10-06")).toBe(
      "upcoming",
    );
  });

  it("informa los días transcurridos desde la salida", () => {
    expect(overdueDays("2026-10-01", "2026-10-06")).toBe(5);
    expect(overdueDays("2026-10-08", "2026-10-06")).toBe(0);
  });
});
