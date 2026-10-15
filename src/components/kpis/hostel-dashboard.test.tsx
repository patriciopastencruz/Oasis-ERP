import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HostelDashboard } from "./hostel-dashboard";
import { rangeOperations } from "@/modules/lodging/domain/monthly-closing";
import { pendingBalances } from "@/modules/lodging/domain/group-weekly-report";
import { emptyGoals } from "@/modules/lodging/domain/report-goals";
import type { GroupWeeklyReport } from "@/modules/lodging/application/group-weekly-queries";

const rooms = [
  { id: "r1", name: "Pieza 1", room_type: "Simple", display_order: 1 },
  { id: "r2", name: "Pieza 2", room_type: "Simple", display_order: 2 },
];

function hostel(code: string, name: string, goal: number | null): GroupWeeklyReport["hostels"][number] {
  const month = rangeOperations(
    "2026-10-01",
    "2026-10-05",
    rooms,
    [
      { room_id: "r1", check_in: "2026-10-01", check_out: "2026-10-04", total_value: 90000 },
      { room_id: "r2", check_in: "2026-10-03", check_out: "2026-10-06", total_value: 60000 },
    ],
    [{ paid_at: "2026-10-02T15:00:00Z", amount: 50000, payment_method: "transfer" }],
    "2026-10-05",
  );
  return {
    unit: { id: code, code, name },
    month,
    reviews: [
      { recorded_on: "2026-10-01", score: 7.0, review_count: 100, categories: { cleanliness: 7.5, wifi: 5 } },
      { recorded_on: "2026-10-03", score: 7.2, review_count: 104, categories: { cleanliness: 7.8, wifi: 5 } },
    ],
    goals: { ...emptyGoals, occupancyPct: goal, bookingScore: 7.5, categories: { cleanliness: 8 } },
    inspections: { available: true, enabled: true, pendingNow: 1, cleanings: 10, inspectedCleanings: 9, inspections: 9, approved: 8, rejected: 1, approvedFirstPct: 80, avgWaitMinutes: 42 },
    pendingClosings: ["2026-10-03"],
    balances: pendingBalances([
      { id: "b1", room: "Pieza 1", guest: "Ana", check_in: "2026-10-01", check_out: "2026-10-04", total_value: 90000, postpaid_company: false, payments: [{ amount: 40000, type: "total", status: "confirmed" }] },
    ]),
  };
}

describe("tablero de KPIs de los hostales", () => {
  it("muestra los 5 bloques y una columna por hostal sin romperse", () => {
    const report: GroupWeeklyReport = {
      reference: "2026-10-12",
      monthStart: "2026-10-01",
      hostels: [hostel("HU", "Hostal Uruguay", 60), hostel("HOC", "Hostal Oasis Centro", null), hostel("HOB", "Hostal Oasis Cobija", 90)],
    };
    const html = renderToStaticMarkup(<HostelDashboard report={report} />);
    for (const title of ["Ocupación del mes", "Venta promedio por habitación y RevPAR", "Inspecciones", "Puntaje en Booking", "Cierres pendientes y montos por cobrar"])
      expect(html).toContain(title);
    for (const name of ["Hostal Uruguay", "Hostal Oasis Centro", "Hostal Oasis Cobija"]) expect(html).toContain(name);
    expect(html).toContain("meta 60%"); // meta de ocupación
    expect(html).toContain("desactualizado hace 9 días"); // puntaje del 03-oct al corte del 12-oct
    expect(html).toContain("$50.000"); // saldo por cobrar de Pieza 1
    expect(html).toContain("03-10"); // cierre pendiente
  });
});
