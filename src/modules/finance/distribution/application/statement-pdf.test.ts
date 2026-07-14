import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildCollectionStatementPdf } from "./statement-pdf";

describe("reporte de cobranza seleccionado", () => {
  it("genera un PDF paginado con trazabilidad por pedido", async () => {
    const bytes = await buildCollectionStatementPdf({
      customer: {
        code: "CLI-000123",
        name: "Cliente de prueba",
        address: "Avenida Granaderos 2145, Calama",
        phone: "+56 9 1234 5678",
      },
      orders: Array.from({ length: 18 }, (_, index) => ({
        order_number: `P-000${index + 1}`,
        created_at: "2026-07-12T14:30:00.000Z",
        total: 12500 + index * 500,
        paid: 2500,
        balance: 10000 + index * 500,
        products:
          "Hielo 2K: 10 bolsas; Agua purificada 20L: 2 bidones; Frappé 1K: 3 bolsas",
      })),
      selectedOnly: true,
      issuedAt: new Date("2026-07-14T12:00:00.000Z"),
    });

    const document = await PDFDocument.load(bytes);
    expect(Buffer.from(bytes).subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(document.getPageCount()).toBeGreaterThan(1);

    if (process.env.OASIS_PDF_PREVIEW)
      writeFileSync(process.env.OASIS_PDF_PREVIEW, bytes);
  });
});
