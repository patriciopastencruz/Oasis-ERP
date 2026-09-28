import { describe, expect, it } from "vitest";
import { auditAttention, durationLabel, healthLine, roomAttention, sortAttention, unitOverview } from "./attention";
import type { OpsBoard, OpsRoom } from "./operations";

// 12:00 en Santiago (UTC-3) el 28-09-2026.
const now = new Date("2026-09-28T15:00:00Z");
const today = "2026-09-28";

const room = (over: Partial<OpsRoom>): OpsRoom => ({
  id: over.name ?? "r",
  name: "Pieza",
  room_type: "Doble",
  display_order: 1,
  operational_status: "inspected",
  rework: false,
  status_changed_at: "2026-09-28T14:30:00Z",
  occupied: false,
  departure_today: false,
  task: null,
  awaiting: null,
  last_rejection: null,
  next_arrival: null,
  incidents: { open: 0, blocking: false, top_priority: null },
  ...over,
});

const board = (rooms: OpsRoom[], over: Partial<OpsBoard> = {}): OpsBoard => ({
  unit: { id: "u1", code: "HOC", name: "Hostal Oasis Centro" },
  today,
  settings: { checkin: "14:00", checkout: "12:00", inspection_alert_minutes: 60, dirty_alert_minutes: 120 },
  arrivals_today: 2,
  departures_today: 1,
  incidents_open: 0,
  rooms,
  ...over,
});

const arrival = (time: string, date = today) => ({ date, time, guests: 2 });

describe("requiere atención", () => {
  it("sucia con check-in en menos de 2 horas: grave; en menos de 1 hora: crítica", () => {
    const items = roomAttention(board([room({ name: "P7", operational_status: "dirty", next_arrival: arrival("13:30") }), room({ name: "P8", operational_status: "dirty", next_arrival: arrival("12:45") })]), now);
    expect(items.map((i) => [i.kind, i.level, i.text])).toEqual([
      ["dirty_arrival", "serious", "P7 sigue sucia y tiene check-in en 1 h 30 min"],
      ["dirty_arrival", "critical", "P8 sigue sucia y tiene check-in en 45 min"],
    ]);
  });

  it("check-in ya vencido sin inspección bloquea el check-in", () => {
    const [item] = roomAttention(board([room({ name: "P3", operational_status: "pending_inspection", next_arrival: arrival("11:00") })]), now);
    expect(item.kind).toBe("checkin_blocked");
    expect(item.level).toBe("critical");
    expect(item.href).toBe("/ops/inspect/P3");
  });

  it("en limpieza o por inspeccionar con llegada próxima", () => {
    const items = roomAttention(
      board([
        room({ name: "A", operational_status: "cleaning", next_arrival: arrival("12:40") }),
        room({ name: "B", operational_status: "pending_inspection", next_arrival: arrival("13:00") }),
        room({ name: "C", operational_status: "cleaning", next_arrival: arrival("15:00") }),
      ]),
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(["cleaning_arrival", "inspection_arrival"]);
  });

  it("mantención con reserva en los próximos días", () => {
    const items = roomAttention(
      board([
        room({ name: "M1", operational_status: "maintenance", next_arrival: arrival("14:00") }),
        room({ name: "M2", operational_status: "out_of_service", next_arrival: arrival("14:00", "2026-09-30") }),
        room({ name: "M3", operational_status: "maintenance", next_arrival: arrival("14:00", "2026-10-05") }),
      ]),
      now,
    );
    expect(items.map((i) => [i.level, i.text])).toEqual([
      ["critical", "M1 está en mantención y tiene llegada hoy"],
      ["serious", "M2 está fuera de servicio y tiene llegada el 30-09"],
    ]);
  });

  it("esperas largas, rechazos, sin responsable e incidencias críticas", () => {
    const items = roomAttention(
      board([
        room({ name: "W", operational_status: "pending_inspection", awaiting: { task_id: "t", completed_at: "2026-09-28T13:30:00Z", completed_by_name: "Ana", duration_minutes: 20, attempt: 1 } }),
        room({ name: "R", operational_status: "dirty", rework: true, last_rejection: { reason: "Baño mal limpiado", at: "2026-09-28T14:00:00Z" } }),
        room({ name: "U", operational_status: "dirty", status_changed_at: "2026-09-28T11:00:00Z" }),
        room({ name: "Busy", operational_status: "dirty", status_changed_at: "2026-09-28T11:00:00Z", task: { id: "t", status: "in_progress", origin: "checkout", attempt: 1, started_at: null, started_by: null, started_by_name: null } }),
        room({ name: "I", incidents: { open: 1, blocking: false, top_priority: "critical" } }),
      ]),
      now,
    );
    expect(items.map((i) => [i.kind, i.text])).toEqual([
      ["inspection_waiting", "W espera inspección hace 1 h 30 min"],
      ["rejected", "Inspección rechazada: R (Baño mal limpiado)"],
      ["unassigned", "U está sucia hace 4 h y nadie la ha tomado"],
      ["critical_incident", "Incidencia crítica en I"],
    ]);
  });

  it("ordena por criticidad y luego por tiempo al check-in", () => {
    const items = roomAttention(
      board([
        room({ name: "late", operational_status: "dirty", next_arrival: arrival("13:50") }),
        room({ name: "soon", operational_status: "dirty", next_arrival: arrival("12:50") }),
        room({ name: "now", operational_status: "dirty", next_arrival: arrival("12:10") }),
      ]),
      now,
    );
    const audit = auditAttention([{ level: "warning", unit: "Centro", text: "Quedan 2 auditorías" }], { Centro: "u1" });
    expect(sortAttention([...audit, ...items]).map((i) => i.roomId ?? i.kind)).toEqual(["now", "soon", "late", "audit"]);
  });

  it("resumen del hostal y línea de estado", () => {
    const b = board(
      [
        room({ name: "a", operational_status: "dirty", next_arrival: arrival("13:30") }),
        room({ name: "b", occupied: true }),
        room({ name: "c" }),
        room({ name: "d", operational_status: "dirty", rework: true, last_rejection: { reason: "Olor", at: "x" } }),
      ],
      { incidents_open: 1 },
    );
    const o = unitOverview(b, roomAttention(b, now));
    expect(o).toMatchObject({ name: "Centro", total: 4, occupied: 1, available: 1, late: 1, pending: 1, incidents: 1, critical: 0 });
    expect(healthLine(o)).toEqual({ ok: false, text: "1 habitación atrasada · 1 incidencia · 1 pendiente" });
    const quiet = unitOverview(board([room({})]), []);
    expect(healthLine(quiet)).toEqual({ ok: true, text: "Operación normal" });
  });

  it("formatea duraciones", () => {
    expect([durationLabel(45), durationLabel(60), durationLabel(95), durationLabel(-3)]).toEqual(["45 min", "1 h", "1 h 35 min", "0 min"]);
  });
});
