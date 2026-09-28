import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260928015647_lodging_supervisor_audits.sql"), "utf8");
const fn = (name: string) => sql.split(`function public.${name}(`)[1]?.split("end $$;")[0] ?? "";

describe("auditoría del supervisor: esquema", () => {
  it("meta = máx(mínimo, ⌈limpiezas × %⌉) acotada a habitaciones limpiadas", () => {
    expect(sql).toContain("least(greatest(cfg.minimum,ceil(c.n*cfg.pct/100.0)::int),c.rooms)");
    expect(sql).toContain("alter column audit_sample_pct set default 20");
  });

  it("sin duplicados: una habitación por semana y una auditoría abierta por supervisor", () => {
    expect(sql).toContain("lodging_supervisor_audits_room_week_idx on public.lodging_supervisor_audits(room_id,week_start) where status in('in_progress','passed','failed')");
    expect(sql).toContain("lodging_supervisor_audits_open_idx on public.lodging_supervisor_audits(supervisor_id,business_unit_id) where status='in_progress'");
  });

  it("candidatas: inspeccionadas, aprobadas por recepción y sin huésped", () => {
    const candidates = sql.split("function public.lodging_audit_candidates(")[1]?.split("$$;")[0] ?? "";
    expect(candidates).toContain("r.operational_status='inspected'");
    expect(candidates).toContain("i.result='approved'");
    expect(candidates).toContain("s.status='checked_in'");
  });

  it("selección ponderada por riesgo con azar, elegida al auditar", () => {
    expect(fn("lodging_audit_draw")).toContain("order by -ln(greatest(random(),1e-12))/c.score limit 1");
    expect(fn("lodging_audit_draw")).toContain("pg_advisory_xact_lock");
  });

  it("falla exige observación, origen, categoría, gravedad y acción; aprobar no toca la habitación", () => {
    const submit = fn("lodging_audit_submit");
    expect(submit).toContain("'La observacion es obligatoria cuando la auditoria falla'");
    expect(submit).toContain("v_responsibility not in('housekeeping','reception','technical','new_issue')");
    const passBranch = submit.split("if not failed then")[1]?.split("return;")[0] ?? "";
    expect(passBranch).not.toContain("lodging_rooms");
  });

  it("valida permiso y unidad; tablas solo de lectura con RLS", () => {
    for (const name of ["lodging_audit_draw", "lodging_audit_skip", "lodging_audit_submit"]) {
      expect(fn(name)).toContain("public.has_permission('lodging.audits.execute')");
      expect(fn(name)).toContain("public.can_access_unit(");
    }
    expect(sql).toContain("alter table public.lodging_supervisor_audits enable row level security");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*lodging_(supervisor_audits|incidents)/i);
  });
});
