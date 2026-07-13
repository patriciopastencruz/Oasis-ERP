export const paymentRequestStatuses = [
  "draft",
  "pending_approval",
  "under_review",
  "correction_requested",
  "approved",
  "rejected",
  "scheduled",
  "paid",
  "cancelled",
] as const;
export type PaymentRequestStatus = (typeof paymentRequestStatuses)[number];

export const allowedStatusTransitions: Readonly<
  Record<PaymentRequestStatus, readonly PaymentRequestStatus[]>
> = {
  draft: ["pending_approval"],
  pending_approval: [
    "under_review",
    "approved",
    "rejected",
    "correction_requested",
  ],
  under_review: ["approved", "rejected", "correction_requested"],
  correction_requested: ["pending_approval"],
  approved: ["scheduled", "cancelled"],
  rejected: [],
  scheduled: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(
  from: PaymentRequestStatus,
  to: PaymentRequestStatus,
): boolean {
  return allowedStatusTransitions[from].includes(to);
}
