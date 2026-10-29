import { describe, expect, it } from "vitest";
import { describeDuplicate, groupDuplicatesByReservation } from "./receipt-duplicates";

const match = (over = {}) => ({
  payment_id: "p2",
  reservation_id: "r2",
  same_reservation: false,
  paid_at: "2026-10-05T12:00:00Z",
  amount: "30000",
  unit_code: "HOC",
  room: "Modular 2",
  guest: "Ana Pérez",
  ...over,
});

describe("comprobantes repetidos", () => {
  it("agrupa por reserva y convierte los montos a número", () => {
    const grouped = groupDuplicatesByReservation([
      { payment_id: "p1", reservation_id: "r1", kind: "op", group_total: "60000", receipt_amount: "30000", matches: [match()] },
      { payment_id: "p1", reservation_id: "r1", kind: "file", group_total: "60000", receipt_amount: null, matches: [match({ amount: 30000 })] },
      { payment_id: "p9", reservation_id: "r9", kind: "otro", group_total: 1, receipt_amount: 1, matches: [match()] },
      { payment_id: "p8", reservation_id: "r8", kind: "op", group_total: 1, receipt_amount: 1, matches: [] },
    ]);
    expect([...grouped.keys()]).toEqual(["r1"]);
    const hits = grouped.get("r1")!;
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ kind: "op", groupTotal: 60000, receiptAmount: 30000 });
    expect(hits[0].matches[0].amount).toBe(30000);
    expect(hits[1].receiptAmount).toBeNull();
  });

  it("describe con quién se repite, sin repetir nombres y acotando la lista", () => {
    const hit = {
      kind: "op" as const,
      groupTotal: 1,
      receiptAmount: 1,
      matches: [match(), match({ payment_id: "p3" }), match({ guest: "Luis", room: null }), match({ guest: "Marta" }), match({ guest: "Rosa" })].map((m) => ({ ...m, amount: Number(m.amount) })),
    };
    const text = describeDuplicate(hit);
    expect(text.startsWith("Mismo número de operación que Ana Pérez (HOC · Modular 2); Luis (HOC); Marta")).toBe(true);
    expect(text.endsWith("y 1 más")).toBe(true);
    expect(describeDuplicate({ ...hit, kind: "file", matches: [{ ...hit.matches[0], same_reservation: true, guest: null }] })).toBe(
      "Mismo archivo que huésped sin nombre (HOC · Modular 2), misma reserva",
    );
  });
});
