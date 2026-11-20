import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(process.cwd(), "supabase/migrations");
const file = readdirSync(dir).find((name) => name.endsWith("_om_supply_send_to_purchasing.sql"));
const sql = file ? readFileSync(resolve(dir, file), "utf8") : "";

describe("migración: bodega ajusta cantidades y envía a compras en un paso", () => {
  it("va en una transacción", () => {
    expect(file).toBeDefined();
    expect(sql).toMatch(/begin;[\s\S]*commit;\s*$/);
  });

  it("la lista ya no descuenta stock ni lo que viene en camino", () => {
    expect(sql).toContain("v_buy:=g.qty;");
    expect(sql).not.toContain("current_stock");
    expect(sql).not.toContain("greatest(0,g.qty-v_stock-v_transit)");
  });

  it("arma, aplica las cantidades y emite dentro de la misma función, solo para bodega", () => {
    expect(sql).toContain("create function public.om_supply_send_to_purchasing(p_requests uuid[],p_quantities jsonb,p_notes text)");
    expect(sql).toContain("inventory.supply.consolidate");
    expect(sql).toContain("om_supply_build_purchase_list(p_requests,p_notes)");
    expect(sql).toContain("perform public.om_supply_issue_list(lid)");
    expect(sql).toContain("Los pedidos cambiaron mientras armabas la lista");
  });

  it("solo usuarios autenticados pueden ejecutarla", () => {
    expect(sql).toContain("from public,anon;");
    expect(sql).toContain("public.om_supply_send_to_purchasing(uuid[],jsonb,text) to authenticated;");
  });
});
