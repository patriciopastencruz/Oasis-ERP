import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";
import { serviceBullets } from "../domain/quotations";

export type LodgingQuotationPdfInput = {
  quotationNumber: string;
  issuedOn: string; // yyyy-mm-dd
  voided: boolean;
  client: { company: string; rut: string | null; contact: string | null };
  hostelAddress: string | null;
  serviceDetail: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lines: { description: string; quantity: number; unitNet: number; nights: number; subtotal: number; iva: number; total: number }[];
  total: number;
  photos: { bytes: Uint8Array; mime: string }[];
};

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const safeText = (value: unknown) => String(value ?? "").replace(/[^\x20-\xFF]/g, "-");
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function wrap(value: string, maxWidth: number, font: PDFFont, size: number) {
  const words = safeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Cotización de hospedaje a empresas, con la estructura del modelo de Oasis Modulares. */
export async function buildLodgingQuotationPdf(input: LodgingQuotationPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.4, 0.4, 0.4);
  const W = 595;
  const H = 842;
  const left = 40;
  const tableW = W - 2 * left;
  let page = pdf.addPage([W, H]);
  let y = H - 36;

  const logo = await pdf.embedPng(
    await readFile(path.join(process.cwd(), "public/oasis-modulares-quotation-logo.png")),
  );
  const logoW = 170;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, { x: left + 20, y: y - logoH, width: logoW, height: logoH });
  y -= logoH + 22;

  page.drawText("COTIZACIÓN DE HOSPEDAJE", { x: W / 2 - bold.widthOfTextAtSize("COTIZACIÓN DE HOSPEDAJE", 13) / 2, y, size: 13, font: bold, color: ink });
  const folio = `N° ${input.quotationNumber}`;
  page.drawText(folio, { x: W - left - regular.widthOfTextAtSize(folio, 9), y: y + 1, size: 9, font: regular, color: muted });
  if (input.voided) {
    page.drawText("ANULADA", { x: W - left - bold.widthOfTextAtSize("ANULADA", 11), y: y - 14, size: 11, font: bold, color: rgb(0.75, 0.1, 0.1) });
  }
  y -= 34;

  const textX = left + 20;
  const row = (label: string, value: string, strong = false) => {
    page.drawText(safeText(`${label}  `), { x: textX, y, size: 12, font: regular, color: ink });
    const lw = regular.widthOfTextAtSize(safeText(`${label}  `), 12);
    for (const [i, ln] of wrap(value, tableW - 20 - lw, strong ? bold : regular, 12).entries()) {
      page.drawText(ln, { x: textX + lw, y: y - i * 15, size: 12, font: strong ? bold : regular, color: ink });
      if (i > 0) y -= 15;
    }
    y -= 18;
  };
  row("Fecha:", dmy(input.issuedOn));
  const clientLine = [input.client.company, input.client.rut && `RUT ${input.client.rut}`, input.client.contact && `Atención: ${input.client.contact}`]
    .filter(Boolean)
    .join(" · ");
  row("Cliente:", clientLine);
  if (input.hostelAddress) row("Dirección:", input.hostelAddress);
  if (input.checkIn && input.checkOut) row("Estadía:", `${dmy(input.checkIn)} al ${dmy(input.checkOut)}`);

  page.drawText("Detalle del servicio:", { x: textX, y, size: 12, font: bold, color: ink });
  y -= 18;
  for (const bullet of serviceBullets(input.serviceDetail)) {
    const ls = wrap(bullet, tableW - 70, regular, 12);
    page.drawText("-", { x: textX + 12, y, size: 12, font: regular, color: ink });
    ls.forEach((ln, i) => page.drawText(ln, { x: textX + 36, y: y - i * 15, size: 12, font: regular, color: ink }));
    y -= ls.length * 15 + 3;
  }
  y -= 12;

  // ---------- Tabla ----------
  const cols = [
    { title: ["Descripción", "Huésped"], w: 118 },
    { title: ["Cantidad"], w: 58 },
    { title: ["Valor Unitario", "(Neto)"], w: 82 },
    { title: ["Fechas"], w: 68 },
    { title: ["Subtotal"], w: 70 },
    { title: ["IVA"], w: 58 },
    { title: ["Total"], w: tableW - (118 + 58 + 82 + 68 + 70 + 58) },
  ];
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, acc[i] + c.w], [left]);
  const cell = (x: number, top: number, w: number, h: number, shade = false) =>
    page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: ink, borderWidth: 0.8, color: shade ? rgb(0.96, 0.96, 0.96) : undefined });

  const drawHeader = () => {
    const h = 34;
    cols.forEach((c, i) => {
      cell(xs[i], y, c.w, h, true);
      c.title.forEach((t, k) => page.drawText(t, { x: xs[i] + 5, y: y - 13 - k * 11, size: 9.5, font: regular, color: ink }));
    });
    y -= h;
  };
  drawHeader();

  for (const l of input.lines) {
    const desc = wrap(l.description, cols[0].w - 10, regular, 9.5);
    const nightsText = `${l.nights} ${l.nights === 1 ? "noche" : "noches"}`;
    const h = Math.max(30, desc.length * 12 + 12);
    if (y - h < 60) {
      page = pdf.addPage([W, H]);
      y = H - 40;
      drawHeader();
    }
    const values = [null, String(l.quantity), money(l.unitNet), nightsText, money(l.subtotal), money(l.iva), money(l.total)];
    cols.forEach((c, i) => {
      cell(xs[i], y, c.w, h);
      if (i === 0) desc.forEach((ln, k) => page.drawText(ln, { x: xs[i] + 5, y: y - 14 - k * 12, size: 9.5, font: regular, color: ink }));
      else page.drawText(values[i]!, { x: xs[i] + 5, y: y - 14, size: 9.5, font: i === 6 ? bold : regular, color: ink });
    });
    y -= h;
  }
  // Fila TOTAL
  const lastW = cols[6].w;
  cell(left, y, tableW - lastW, 28);
  cell(xs[6], y, lastW, 28);
  page.drawText("TOTAL", { x: left + tableW - lastW - 8 - bold.widthOfTextAtSize("TOTAL", 10.5), y: y - 18, size: 10.5, font: bold, color: ink });
  page.drawText(money(input.total), { x: xs[6] + 5, y: y - 18, size: 10.5, font: bold, color: ink });
  y -= 28 + 22;

  // ---------- Fotos ----------
  const images: PDFImage[] = [];
  for (const p of input.photos.slice(0, 4)) {
    try {
      images.push(p.mime === "image/png" ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes));
    } catch {
      // WebP u otros formatos no embebibles: se omiten sin romper el PDF.
    }
  }
  if (images.length) {
    const gap = 6;
    const boxW = (tableW - gap * (images.length - 1)) / images.length;
    const boxH = 170;
    if (y - boxH < 40) {
      page = pdf.addPage([W, H]);
      y = H - 40;
    }
    images.forEach((img, i) => {
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: left + i * (boxW + gap) + (boxW - w) / 2, y: y - h, width: w, height: h });
    });
  }

  return pdf.save();
}
