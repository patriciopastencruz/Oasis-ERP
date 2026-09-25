import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260925211143_cash_flow_daily_closing.sql"),
  "utf8",
);

describe("esquema de flujo de caja", () => {
  it("crea las tablas con compañía y unidad de negocio", () => {
    for (const table of ["cash_flow_categories", "cash_flow_entries", "cash_flow_daily_closings"]) {
      const body = sql.split(`create table public.${table}(`)[1]?.split(");")[0] ?? "";
      expect(body).toContain("company_id uuid not null");
      expect(body).toContain("business_unit_id uuid not null");
      expect(body).toContain("references public.business_units(company_id,id)");
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create trigger audit_${table}`);
    }
  });

  it("solo permite lectura directa; las escrituras pasan por funciones", () => {
    expect(sql).toContain(
      "grant select on public.cash_flow_categories,public.cash_flow_entries,public.cash_flow_daily_closings to authenticated",
    );
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*cash_flow_(entries|daily_closings)/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("anula en vez de eliminar y bloquea días cerrados", () => {
    expect(sql).toContain("voided_at=now()");
    expect(sql).not.toMatch(/delete from public\.cash_flow/i);
    expect(sql.match(/cash_flow_day_is_closed\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("calcula los totales del cierre desde los movimientos vigentes", () => {
    const close = sql.split("function public.cash_flow_close_day")[1]?.split("end $$;")[0] ?? "";
    expect(close).toContain("sum(amount) filter(where kind='income')");
    expect(close).toContain("voided_at is null");
    expect(close).not.toContain("payload->>'total_income'");
  });

  it("valida permisos y unidad en cada función de mutación", () => {
    for (const fn of [
      "cash_flow_record_entry",
      "cash_flow_void_entry",
      "cash_flow_close_day",
      "cash_flow_reopen_day",
      "cash_flow_create_category",
      "cash_flow_toggle_category",
    ]) {
      const body = sql.split(`function public.${fn}(`)[1]?.split("end $$;")[0] ?? "";
      expect(body).toMatch(/public\.has_permission\('finance\.cash_flow\.(record|manage)'\)/);
      expect(body).toContain("public.can_access_unit(");
    }
  });
});
