import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/lodging/application/actions", () => ({
  decideReservationCancellationAction: vi.fn(),
  requestReservationCancellationAction: vi.fn(),
  settleCancelledPaymentsAction: vi.fn(),
}));
vi.mock("@/components/sales/confirm-button", () => ({
  ConfirmButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

const { ReservationCancellation } = await import("./reservation-cancellation");

const base = {
  reservationId: "r1",
  importedFromIcal: false,
  cancellationReason: null,
  latest: null,
  canRequest: true,
  canApprove: false,
  startsTodayOrLater: true,
  paymentsRetained: false,
  moveCandidates: [{ id: "r2", label: "Pieza 2 · 06-11 al 07-11 · Ana" }],
  canVoidPayments: false,
  canSettlePayments: true,
};

describe("anulación de reserva con pagos", () => {
  it("pide decidir qué pasa con los pagos al anular", () => {
    const html = renderToStaticMarkup(<ReservationCancellation {...base} status="confirmed" totalPaid={28000} />);
    expect(html).toContain("¿Qué pasa con los pagos?");
    expect(html).toContain('value="move"');
    expect(html).toContain("Pieza 2 · 06-11 al 07-11 · Ana");
    expect(html).toContain("Requiere aprobación del administrador.");
  });

  it("sin pagos no pregunta", () => {
    const html = renderToStaticMarkup(<ReservationCancellation {...base} status="confirmed" totalPaid={0} />);
    expect(html).not.toContain("¿Qué pasa con los pagos?");
  });

  it("en una reserva anulada con pagos permite resolverlos", () => {
    const html = renderToStaticMarkup(<ReservationCancellation {...base} status="cancelled" totalPaid={14220} />);
    expect(html).toContain("pagos sin resolver");
    expect(html).toContain("Resolver pagos");
  });

  it("los pagos retenidos se informan como ingreso", () => {
    const html = renderToStaticMarkup(<ReservationCancellation {...base} status="cancelled" totalPaid={14220} paymentsRetained />);
    expect(html).toContain("Pagos retenidos");
    expect(html).not.toContain("Resolver pagos");
  });
});
