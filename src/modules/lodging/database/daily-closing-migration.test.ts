import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260926000957_lodging_daily_closing.sql"),
  "utf8",
);
const fn = (name: string) => sql.split(`function public.${name}(`)[1]?.split("end $$;")[0] ?? "";

describe("esquema del cierre diario de hostal", () => {
  it("crea las tablas con compañía, unidad, RLS y auditoría", () => {
    for (const table of ["lodging_daily_closings", "lodging_daily_closing_expenses"]) {
      const body = sql.split(`create table public.${table}(`)[1]?.split(");")[0] ?? "";
      expect(body).toContain("company_id uuid not null");
      expect(body).toContain("business_unit_id uuid not null");
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create trigger audit_${table}`);
    }
    expect(sql).toContain("unique(business_unit_id,closing_date)");
  });

  it("solo concede lectura; las escrituras pasan por funciones", () => {
    expect(sql).toContain("grant select on public.lodging_daily_closings,public.lodging_daily_closing_expenses to authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*lodging_daily_closing/i);
    expect(sql).toContain("revoke execute on function public.lodging_closing_metrics_internal(uuid,date) from public,anon,authenticated");
  });

  it("calcula ingresos por fecha de pago en Santiago y descuenta reembolsos", () => {
    const metrics = sql.split("function public.lodging_closing_metrics_internal(")[1] ?? "";
    expect(metrics).toContain("(p.paid_at at time zone 'America/Santiago')::date=target_date");
    expect(metrics).toContain("case when p.type='refund' then -p.amount else p.amount end");
    expect(metrics).toContain("p.status='confirmed'");
  });

  it("recepción solo cierra hoy o ayer y no corrige cierres emitidos", () => {
    const save = fn("lodging_save_daily_closing");
    expect(save).toContain("target_date<today-1 and not public.has_permission('lodging.closings.manage')");
    expect(save).toContain("c.status='issued' and not public.has_permission('lodging.closings.manage')");
    expect(save).not.toContain("payload->>'total_received'");
    expect(save).toContain("set deleted_at=now()");
  });

  it("valida permiso y unidad en cada función expuesta", () => {
    for (const name of [
      "lodging_closing_metrics",
      "lodging_save_daily_closing",
      "lodging_issue_daily_closing",
      "lodging_closing_email_recipients",
      "lodging_mark_closing_emailed",
    ]) {
      const body = fn(name);
      expect(body).toMatch(/public\.has_permission\('lodging\.closings\.(create|reports)'\)/);
      expect(body).toContain("public.can_access_unit(");
    }
  });

  it("envía el correo solo a administradores y superadministradores", () => {
    expect(fn("lodging_closing_email_recipients")).toContain("r.key in('administrator','superadmin')");
  });
});
