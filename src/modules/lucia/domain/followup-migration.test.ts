import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261028172959_lucia_followup_skip_farewell.sql", "utf8");

describe("recontacto de Lucía: no insistir a quien se despidió", () => {
  it("omite al cliente cuyo último mensaje agradece, se despide o rechaza", () => {
    expect(sql).toContain("m.sender_type='customer'");
    for (const word of ["gracias", "chao", "no me sirve", "lo voy a pensar"]) expect(sql).toContain(word);
  });
  it("no usa como nombre un contacto sin letras", () => {
    expect(sql).toContain("first_name !~ '[[:alpha:]]'");
  });
  it("sigue siendo solo para service_role y no borra datos", () => {
    expect(sql).toContain("revoke execute on function public.lucia_send_followups(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.lucia_send_followups(uuid) to service_role");
    expect(sql).not.toMatch(/delete from|drop table|truncate/i);
  });
});
