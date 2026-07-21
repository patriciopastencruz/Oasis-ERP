import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type QuotationPdfLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type QuotationPdfInput = {
  quotationNumber: string;
  issuedAt: Date;
  client: {
    company: string;
    rut: string | null;
    contact: string | null;
    email: string | null;
    place: string | null;
  };
  lines: QuotationPdfLine[];
  discount: number;
  net: number;
  iva: number;
  total: number;
  terms: string | null;
};

const money = (value: number) =>
  `$ ${Math.round(value).toLocaleString("es-CL")}`;

const safeText = (value: unknown) =>
  String(value ?? "—").replace(/[^\x20-\xFF]/g, "-");

const wrapText = (
  value: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
) => {
  const words = safeText(value).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

export async function buildQuotationPdf({
  quotationNumber,
  issuedAt,
  client,
  lines,
  discount,
  net,
  iva,
  total,
  terms,
}: QuotationPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.09, 0.28, 0.55);
  const muted = rgb(0.38, 0.45, 0.41);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const draw = (
    value: string,
    x: number,
    size = 10,
    font = regular,
    color = rgb(0.08, 0.12, 0.1),
  ) => page.drawText(safeText(value), { x, y, size, font, color });
  const drawTableHeader = () => {
    page.drawRectangle({
      x: 44,
      y: y - 8,
      width: 507,
      height: 24,
      color: primary,
    });
    for (const [label, x] of [
      ["Item", 52],
      ["Producto", 90],
      ["Cantidad", 350],
      ["Precio", 420],
      ["Subtotal", 490],
    ] as const)
      page.drawText(label, {
        x,
        y,
        size: 8,
        font: bold,
        color: rgb(1, 1, 1),
      });
    y -= 27;
  };
  const nextPage = () => {
    page = pdf.addPage([595, 842]);
    y = 790;
    page.drawText(`Cotización ${quotationNumber} (continuación)`, {
      x: 44,
      y,
      size: 11,
      font: bold,
      color: primary,
    });
    y -= 34;
    drawTableHeader();
  };

  page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: primary });
  page.drawText("OASIS MODULARES & CONSTRUCCIÓN SPA.", {
    x: 44,
    y: 810,
    size: 15,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("RUT: 78.271.136-9 · +56 9 39468154 / +56 9 56632039", {
    x: 44,
    y: 793,
    size: 9,
    font: regular,
    color: rgb(1, 1, 1),
  });
  page.drawText("Calama - La Serena", {
    x: 44,
    y: 779,
    size: 9,
    font: regular,
    color: rgb(1, 1, 1),
  });
  y = 724;
  draw("COTIZACIÓN DE SERVICIOS", 44, 14, bold, primary);
  draw(`N° ${quotationNumber}`, 420, 12, bold, primary);
  y -= 18;
  draw(
    `Fecha: ${issuedAt.toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`,
    44,
    9,
    regular,
    muted,
  );
  y -= 26;
  draw("Datos del cliente", 44, 11, bold, primary);
  y -= 18;
  draw(`Empresa: ${client.company}`, 44, 9);
  y -= 15;
  draw(`Rut: ${client.rut ?? "—"}`, 44, 9);
  y -= 15;
  draw(`Contacto: ${client.contact ?? "—"}`, 44, 9);
  y -= 15;
  draw(`Correo: ${client.email ?? "—"}`, 44, 9);
  y -= 15;
  draw(`Lugar: ${client.place ?? "—"}`, 44, 9);
  y -= 26;
  drawTableHeader();

  for (const line of lines) {
    const productLines = wrapText(line.description, 250, regular, 8);
    const rowHeight = Math.max(24, productLines.length * 11 + 8);
    if (y - rowHeight < 140) nextPage();
    productLines.forEach((text, index) => {
      page.drawText(text, {
        x: 90,
        y: y - index * 11,
        size: 8,
        font: regular,
        color: rgb(0.08, 0.12, 0.1),
      });
    });
    draw(String(line.quantity), 350, 8);
    draw(money(line.unitPrice), 420, 8);
    draw(money(line.lineTotal), 490, 8, bold);
    y -= rowHeight;
    page.drawLine({
      start: { x: 44, y: y + 7 },
      end: { x: 551, y: y + 7 },
      thickness: 0.5,
      color: rgb(0.87, 0.9, 0.88),
    });
  }

  if (y - 100 < 90) nextPage();
  y -= 20;
  page.drawRectangle({
    x: 300,
    y: y - 78,
    width: 251,
    height: 90,
    color: rgb(0.95, 0.97, 0.96),
  });
  const totalsY = y - 8;
  y = totalsY;
  draw("Descuento", 315, 9, regular, muted);
  draw(money(discount), 470, 9, bold, rgb(0.65, 0.18, 0.12));
  y -= 20;
  draw("Neto", 315, 9, regular, muted);
  draw(money(net), 470, 9, bold);
  y -= 20;
  draw("IVA (19%)", 315, 9, regular, muted);
  draw(money(iva), 470, 9, bold);
  y -= 20;
  draw("Total", 315, 11, bold, primary);
  draw(money(total), 460, 13, bold, primary);
  y -= 40;

  if (terms) {
    if (y < 140) nextPage();
    draw("Términos y condiciones", 44, 10, bold, primary);
    y -= 16;
    for (const paragraph of terms.split("\n")) {
      for (const wrapped of wrapText(paragraph, 500, regular, 8)) {
        if (y < 45) nextPage();
        draw(wrapped, 44, 8, regular, muted);
        y -= 12;
      }
    }
  }

  return pdf.save();
}
