import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261007115925_lodging_receipt_ai_review.sql",
  ),
  "utf8",
);

describe("revisión IA de comprobantes de alojamiento", () => {
  it("guarda estado, evidencia extraída y trazabilidad del modelo", () => {
    expect(sql).toContain("ai_review_status");
    expect(sql).toContain("ai_detected_amount");
    expect(sql).toContain("ai_confidence");
    expect(sql).toContain("ai_model");
    expect(sql).toContain("ai_reviewed_at");
  });

  it("restringe estados y confianza", () => {
    expect(sql).toContain(
      "('pending','matched','mismatch','unreadable','error')",
    );
    expect(sql).toContain("ai_confidence between 0 and 1");
  });

  it("indexa los filtros operativos por unidad", () => {
    expect(sql).toContain("lodging_receipts_unit_ai_review_idx");
    expect(sql).toContain("business_unit_id, ai_review_status");
    expect(sql).toContain("where deleted_at is null");
  });
});
