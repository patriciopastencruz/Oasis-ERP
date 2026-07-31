import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export type ProjectContractPdfInput = {
  projectNumber: string;
  contractNumber: string | null;
  contractCity: string;
  contractDate: Date;
  client: {
    company: string;
    rut: string | null;
  };
  quotationNumber: string | null;
  quotationDate: Date | null;
  netIncome: number;
  estimatedEndDate: Date | null;
  activities: string[];
  paymentTerms: string[];
};

const clp = (value: number) =>
  `$ ${Math.round(value).toLocaleString("es-CL")}.-`;

const safeText = (value: unknown) =>
  String(value ?? "—").replace(/[^\x20-\xFF]/g, "-");

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function letterList(items: string[]): string[] {
  return items.map((item, i) => `${String.fromCharCode(97 + i)}) ${item}`);
}

export async function buildProjectContractPdf({
  projectNumber,
  contractNumber,
  contractCity,
  contractDate,
  client,
  quotationNumber,
  quotationDate,
  netIncome,
  estimatedEndDate,
  activities,
  paymentTerms,
}: ProjectContractPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.09, 0.28, 0.55);
  const muted = rgb(0.38, 0.45, 0.41);
  const ink = rgb(0.08, 0.12, 0.1);

  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 790;

  const logoBytes = await readFile(
    path.join(process.cwd(), "public/oasis-modulares-quotation-logo.png"),
  );
  const logoImage = await pdf.embedPng(logoBytes);
  const logoWidth = 150;
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;

  function drawHeader() {
    const logoY = 842 - 24 - logoHeight;
    page.drawImage(logoImage, {
      x: 44,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
    });
    const drawRight = (
      value: string,
      yPos: number,
      size: number,
      font: PDFFont,
      color = muted,
    ) => {
      const text = safeText(value);
      const width = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: 551 - width, y: yPos, size, font, color });
    };
    drawRight("OASIS MODULARES Y CONSTRUCCIÓN SPA.", 818, 11, bold, primary);
    drawRight("RUT: 78.271.136-9", 802, 8, regular, muted);
    drawRight("Antofagasta N° 2183, Calama", 790, 8, regular, muted);
    page.drawLine({
      start: { x: 44, y: logoY - 12 },
      end: { x: 551, y: logoY - 12 },
      thickness: 1.5,
      color: primary,
    });
    y = logoY - 34;
  }

  function newPage() {
    page = pdf.addPage([595, 842]);
    y = 790;
    drawHeader();
  }

  drawHeader();

  function drawCentered(
    text: string,
    size: number,
    font: PDFFont,
    color = primary,
  ) {
    const t = safeText(text);
    const width = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: (595 - width) / 2, y, size, font, color });
    y -= size + 10;
  }

  function drawParagraph(
    text: string,
    opts: {
      x?: number;
      width?: number;
      size?: number;
      font?: PDFFont;
      color?: typeof ink;
      leading?: number;
      before?: number;
    } = {},
  ) {
    const x = opts.x ?? 44;
    const width = opts.width ?? 507;
    const size = opts.size ?? 9;
    const font = opts.font ?? regular;
    const color = opts.color ?? ink;
    const leading = opts.leading ?? size + 4;
    if (opts.before) y -= opts.before;
    const words = safeText(text).split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
        line = candidate;
      } else {
        if (y < 70) newPage();
        page.drawText(line, { x, y, size, font, color });
        y -= leading;
        line = word;
      }
    }
    if (line) {
      if (y < 70) newPage();
      page.drawText(line, { x, y, size, font, color });
      y -= leading;
    }
  }

  function drawClause(label: string, text: string) {
    y -= 8;
    if (y < 80) newPage();
    drawParagraph(`${label} ${text}`, { size: 9, before: 0 });
  }

  drawCentered("CONTRATO DE COMPRAVENTA Y SERVICIOS", 13, bold);
  if (contractNumber) {
    const label = `N° ${contractNumber}`;
    const width = bold.widthOfTextAtSize(label, 10);
    page.drawText(label, {
      x: 551 - width,
      y,
      size: 10,
      font: bold,
      color: primary,
    });
    y -= 16;
  }
  y -= 6;

  const dateText = `${contractDate.getDate()} de ${MONTHS[contractDate.getMonth()]} de ${contractDate.getFullYear()}`;
  drawParagraph(
    `En ${contractCity}, ${dateText} comparecen, don PATRICIO OSCAR EDUARDO PASTEN CRUZ, Ingeniero civil industrial, chileno, cédula nacional de identidad N° 18.654.388-2, en representación de Oasis Modulares y Construcción SpA, RUT 78.271.136-9, en adelante "El Vendedor", domiciliado en calle Antofagasta N° 2183, comuna de Calama, correo electrónico oasismodulares@gmail.com, y por la otra parte ${client.company}, RUT N° ${client.rut ?? "por confirmar"}, denominada en adelante como "Cliente", quienes han convenido el siguiente contrato de Compraventa y de servicios, contrato que se regirá por las cláusulas que a continuación se establecen:`,
    { before: 4 },
  );

  y -= 6;
  const quotationRef = quotationNumber
    ? ` según cotización N° ${quotationNumber}${quotationDate ? ` de fecha ${quotationDate.getDate()} de ${MONTHS[quotationDate.getMonth()]} de ${quotationDate.getFullYear()}` : ""}, la cual es parte íntegra del presente contrato,`
    : "";
  drawParagraph(
    `PRIMERO: El Cliente ha solicitado al Vendedor los productos y/o servicios detallados a continuación,${quotationRef} por un valor total de ${clp(netIncome)} Neto, en consecuencia, el encargo comprenderá las siguientes actividades:`,
    { font: bold, before: 0 },
  );
  y -= 4;
  for (const item of letterList(activities)) {
    drawParagraph(item, { x: 58, width: 493, before: 0 });
    y -= 2;
  }

  drawClause(
    "SEGUNDO:",
    "Todos los abonos pagados, en caso de desistir la compra, no son reembolsables bajo ninguna modalidad.",
  );

  y -= 8;
  if (y < 80) newPage();
  drawParagraph(
    "TERCERO: La forma de pago de la suma recién individualizada será la siguiente:",
    { size: 9 },
  );
  y -= 4;
  for (const item of letterList(paymentTerms)) {
    drawParagraph(item, { x: 58, width: 493, before: 0 });
    y -= 2;
  }

  drawClause(
    "CUARTO:",
    "Todos los gastos adicionales que se produzcan por la instalación serán de cargo del cliente, valores no comprendidos en la cotización.",
  );
  drawClause(
    "QUINTO:",
    "El Cliente se obliga a tener el terreno despejado y disponible, con los accesos correspondientes, para la entrega e instalación de los productos.",
  );
  drawClause(
    "SEXTO:",
    "Los valores aquí pactados son irrevocables, no sufrirán alteración y seguirán vigentes hasta la entrega, lo que se entiende convenido a todo evento, respecto del precio.",
  );
  drawClause(
    "SÉPTIMO:",
    "Todos los valores están señalados en el presente contrato, lo que se entiende aceptado por las partes en este acto, lo cual tiene como consecuencia la garantía de seriedad de la oferta; los valores pagados no serán devueltos en caso de retracto del cliente, monto que asegura la compra.",
  );
  drawClause(
    "OCTAVO:",
    "Los productos objeto del presente contrato serán entregados completamente terminados y habilitados, de acuerdo con las especificaciones técnicas y características pactadas entre las partes.",
  );
  const deadlineText = estimatedEndDate
    ? `${estimatedEndDate.getDate()} de ${MONTHS[estimatedEndDate.getMonth()]} de ${estimatedEndDate.getFullYear()}`
    : "una fecha a convenir por escrito entre las partes";
  drawClause(
    "NOVENO:",
    `El Vendedor se compromete a finalizar la instalación de los productos antes del ${deadlineText}. En caso de atraso no atribuible a fuerza mayor, caso fortuito, o al incumplimiento del Cliente respecto de sus propias obligaciones (entrega del terreno, accesos, pagos pactados), el Vendedor deberá informar por escrito al Cliente la nueva fecha estimada de término, sin perjuicio de los demás derechos que correspondan al Cliente conforme a la ley.`,
  );
  drawClause(
    "DÉCIMO:",
    "El Vendedor garantiza la correcta ejecución de la instalación de los productos entregados por un plazo de 90 días corridos contados desde la fecha de entrega, cubriendo defectos imputables a la instalación. Esta garantía no cubre daños derivados de mal uso, modificaciones no autorizadas por el Vendedor, ni desgaste normal de los materiales.",
  );
  drawClause(
    "UNDÉCIMO:",
    `Toda controversia o diferencia relativa a este contrato, en cuanto a su interpretación o ejecución, será resuelta por los Juzgados Civiles de ${contractCity}.`,
  );

  if (y < 170) newPage();
  y -= 40;
  const sigY = y;
  page.drawLine({
    start: { x: 60, y: sigY },
    end: { x: 230, y: sigY },
    thickness: 1,
    color: ink,
  });
  page.drawLine({
    start: { x: 340, y: sigY },
    end: { x: 510, y: sigY },
    thickness: 1,
    color: ink,
  });
  page.drawText("Patricio Oscar Pasten C.", {
    x: 70,
    y: sigY - 14,
    size: 9,
    font: bold,
    color: ink,
  });
  page.drawText("Rut: 18.654.388-2 — El Vendedor", {
    x: 70,
    y: sigY - 28,
    size: 8,
    font: regular,
    color: muted,
  });
  const clientLabel = safeText(client.company);
  page.drawText(clientLabel.slice(0, 40), {
    x: 350,
    y: sigY - 14,
    size: 9,
    font: bold,
    color: ink,
  });
  page.drawText(`Rut: ${safeText(client.rut ?? "—")} — El Cliente`, {
    x: 350,
    y: sigY - 28,
    size: 8,
    font: regular,
    color: muted,
  });

  y -= 44;
  drawParagraph(
    `Proyecto ${projectNumber} — documento generado por Oasis ERP, pendiente de firma.`,
    {
      size: 7,
      font: regular,
      color: muted,
    },
  );

  return pdf.save();
}
