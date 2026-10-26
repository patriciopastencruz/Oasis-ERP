import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPENSE_UNIT_CODES } from "../domain/expenses";

const sql = readFileSync("supabase/migrations/20261026195835_lodging_expenses_all_hostels.sql", "utf8");

describe("gastos en los tres hostales", () => {
  it("la base y la aplicación aceptan los mismos hostales", () => {
    expect(EXPENSE_UNIT_CODES).toEqual(["HU", "HOC", "HOB"]);
    expect(sql).toContain("unit.code not in('HU','HOC','HOB')");
  });
  it("Centro y Cobija reciben los mismos tipos de gasto que Uruguay, sin borrar nada", () => {
    expect(sql).toContain("u.code in('HOC','HOB')");
    for (const name of ["Aseo y limpieza", "Insumos de cocina", "Lavandería", "Luz", "Agua", "Internet y telefonía"])
      expect(sql).toContain(`'${name}'`);
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
});
