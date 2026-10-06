import {
  netConfirmedPayments,
  type BalancePayment,
} from "./outstanding-balances";

export type PriceAuditStatus =
  "ok" | "missing_price" | "missing_rate" | "mismatch";

export type ReservationPriceInput = {
  nights: number;
  nightlyRate: number | string;
  discount: number | string;
  surcharge: number | string;
  totalValue: number | string;
  payments: BalancePayment[];
};

export function auditReservationPrice(input: ReservationPriceInput) {
  const nightlyRate = Number(input.nightlyRate);
  const discount = Number(input.discount);
  const surcharge = Number(input.surcharge);
  const registeredTotal = Number(input.totalValue);
  const paid = netConfirmedPayments(input.payments);

  if (registeredTotal <= 0) {
    return {
      status: "missing_price" as const,
      expectedTotal: null,
      registeredTotal,
      difference: null,
      paid,
    };
  }
  if (nightlyRate <= 0) {
    return {
      status: "missing_rate" as const,
      expectedTotal: null,
      registeredTotal,
      difference: null,
      paid,
    };
  }

  const expectedTotal = input.nights * nightlyRate - discount + surcharge;
  const difference = registeredTotal - expectedTotal;
  return {
    status: (Math.abs(difference) > 0.5 ? "mismatch" : "ok") as
      "mismatch" | "ok",
    expectedTotal,
    registeredTotal,
    difference,
    paid,
  };
}
