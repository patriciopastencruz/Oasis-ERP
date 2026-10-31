import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildLodgingQuotationPdf, type LodgingQuotationPdfInput } from "./quotation-pdf";

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** PNG gris de 8x8: suficiente para que pdf-lib lo incruste. */
function tinyPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  header[9] = 0;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(8, 128)])));
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]),
  );
}

const base: LodgingQuotationPdfInput = {
  quotationNumber: "COT-TEST",
  issuedOn: "2026-10-31",
  voided: false,
  client: { company: "Empresa de prueba", rut: null, contact: null },
  hostelAddress: null,
  serviceDetail: null,
  checkIn: null,
  checkOut: null,
  lines: [{ description: "Habitación doble", quantity: 1, unitNet: 10000, nights: 1, subtotal: 10000, iva: 1900, total: 11900 }],
  net: 10000,
  iva: 1900,
  total: 11900,
  photos: [],
};

async function imageCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  let total = 0;
  for (const page of doc.getPages()) {
    const xobjects = page.node.Resources()?.lookup(await import("pdf-lib").then((m) => m.PDFName.of("XObject")));
    if (xobjects && "keys" in xobjects) total += (xobjects as { keys(): unknown[] }).keys().length;
  }
  return total;
}

describe("PDF de cotización de hostal", () => {
  it("incluye las 10 fotos cuando se adjuntan 10", async () => {
    const png = tinyPng();
    const withoutPhotos = await imageCount(await buildLodgingQuotationPdf(base));
    const withTen = await imageCount(
      await buildLodgingQuotationPdf({ ...base, photos: Array.from({ length: 10 }, () => ({ bytes: png, mime: "image/png" })) }),
    );
    expect(withTen - withoutPhotos).toBe(10);
  });

  it("ignora fotos por sobre el máximo", async () => {
    const png = tinyPng();
    const withoutPhotos = await imageCount(await buildLodgingQuotationPdf(base));
    const withTwelve = await imageCount(
      await buildLodgingQuotationPdf({ ...base, photos: Array.from({ length: 12 }, () => ({ bytes: png, mime: "image/png" })) }),
    );
    expect(withTwelve - withoutPhotos).toBe(10);
  });
});
