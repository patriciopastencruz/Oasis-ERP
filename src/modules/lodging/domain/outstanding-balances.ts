export type BalancePayment = {
  amount: number | string;
  type: string;
  status: string;
};

export type BalanceStage = "overdue" | "current" | "upcoming";

export function netConfirmedPayments(payments: BalancePayment[]) {
  return payments
    .filter((payment) => payment.status === "confirmed")
    .reduce(
      (total, payment) =>
        total +
        (payment.type === "refund"
          ? -Number(payment.amount)
          : Number(payment.amount)),
      0,
    );
}

export function outstandingBalance(
  totalValue: number | string,
  payments: BalancePayment[],
) {
  return Number(totalValue) - netConfirmedPayments(payments);
}

export function balanceStage(
  checkIn: string,
  checkOut: string,
  today: string,
): BalanceStage {
  if (checkOut < today) return "overdue";
  if (checkIn <= today) return "current";
  return "upcoming";
}

export function overdueDays(checkOut: string, today: string) {
  if (checkOut > today) return 0;
  const departure = Date.parse(`${checkOut}T12:00:00Z`);
  const current = Date.parse(`${today}T12:00:00Z`);
  return Math.max(0, Math.floor((current - departure) / 86_400_000));
}
