import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260926132143_lodging_operations_core.sql"), "utf8");
const fn = (name: string) => sql.split(`function public.${name}(`)[1]?.split("end $$;")[0] ?? "";

describe("portal operativo: esquema", () => {
  it("define los estados operacionales independientes de la reserva", () => {
    expect(sql).toContain("check(operational_status in('dirty','cleaning','pending_inspection','inspected','maintenance','out_of_service'))");
  });

  it("impide dos limpiezas abiertas de la misma habitación", () => {
    expect(sql).toContain("create unique index lodging_housekeeping_tasks_open_room_idx on public.lodging_housekeeping_tasks(room_id) where status in('pending','in_progress')");
  });

  it("solo concede lectura; las transiciones pasan por funciones con la fila bloqueada", () => {
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*lodging_(housekeeping_tasks|room_inspections|room_status_events)/i);
    for (const name of ["lodging_housekeeping_start", "lodging_room_inspect", "lodging_check_in", "lodging_check_out"]) {
      expect(fn(name)).toContain("for update");
      expect(fn(name)).toContain("public.can_access_unit(");
    }
  });

  it("valida cada transición en la base de datos", () => {
    expect(fn("lodging_housekeeping_start")).toContain("if v_room.operational_status<>'dirty'");
    expect(fn("lodging_room_inspect")).toContain("if v_room.operational_status<>'pending_inspection'");
    expect(fn("lodging_room_inspect")).toContain("'Indica el motivo del rechazo'");
    expect(fn("lodging_check_in")).toContain("if v_room.operational_status<>'inspected'");
    expect(fn("lodging_check_in")).toContain("public.has_permission('lodging.checkin.override')");
    expect(fn("lodging_check_in")).toContain("'checkin_override'");
    expect(fn("lodging_check_out")).toContain("lodging_payment_summary");
  });

  it("el tablero operacional no expone datos financieros ni del huésped", () => {
    const board = sql.split("function public.lodging_ops_board(")[1]?.split("$$;")[0] ?? "";
    expect(board).not.toMatch(/total_value|amount|full_name|phone|document/);
  });

  it("la salida de mantención vuelve a inspección", () => {
    expect(fn("lodging_rooms_sync_operational")).toContain("new.operational_status:='pending_inspection'");
  });
});
