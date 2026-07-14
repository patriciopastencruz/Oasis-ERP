export const ORDER_STATUSES = [
  "draft",
  "scheduled",
  "assigned",
  "en_route",
  "delivered",
  "partially_delivered",
  "not_delivered",
  "rescheduled",
  "cancelled",
  "voided",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["assigned", "cancelled", "voided"],
  assigned: ["en_route", "scheduled", "cancelled", "voided"],
  en_route: ["delivered", "partially_delivered", "not_delivered"],
  delivered: [],
  partially_delivered: [],
  not_delivered: ["rescheduled"],
  rescheduled: [],
  cancelled: [],
  voided: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return transitions[from].includes(to);
}

export function calculateOrderTotal(
  lines: readonly { quantity: number; unitPrice: number }[],
  discount = 0,
) {
  if (!lines.length) throw new Error("El pedido requiere productos.");
  const subtotal = lines.reduce((sum, line) => {
    if (line.quantity <= 0 || line.unitPrice < 0)
      throw new Error("Línea inválida.");
    return sum + line.quantity * line.unitPrice;
  }, 0);
  if (discount < 0 || discount > subtotal)
    throw new Error("Descuento inválido.");
  return { subtotal, total: subtotal - discount };
}

export function paymentState(total: number, paid: number) {
  if (paid < 0 || paid > total) throw new Error("Pago inválido.");
  return paid === 0 ? "pending" : paid === total ? "paid" : "partial";
}

export function iceKilograms(
  lines: readonly { quantity: number; iceWeightKg: number }[],
) {
  return lines.reduce((sum, line) => sum + line.quantity * line.iceWeightKg, 0);
}
