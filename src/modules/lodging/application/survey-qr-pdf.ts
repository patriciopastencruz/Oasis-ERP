import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4: [number, number] = [595.28, 841.89];
const TERRACOTTA = rgb(0.757, 0.396, 0.184);
const INK = rgb(0.141, 0.11, 0.086);
const MUTED = rgb(0.42, 0.365, 0.31);

/**
 * Cartel A4 para pegar en una habitación: nombre del hostal y de la pieza, un
 * QR grande a la encuesta y una invitación corta. Un PDF por habitación.
 */
export async function buildSurveyQrPdf(input: {
  unitName: string;
  roomName: string;
  url: string;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const [width, height] = A4;

  const centered = (
    text: string,
    y: number,
    size: number,
    font = regular,
    color = INK,
  ) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  centered(input.unitName.toUpperCase(), height - 90, 14, bold, TERRACOTTA);
  centered(input.roomName, height - 150, 54, bold);

  const png = await QRCode.toBuffer(input.url, {
    type: "png",
    margin: 1,
    width: 900,
    errorCorrectionLevel: "M",
  });
  const qr = await pdf.embedPng(png);
  const size = 340;
  page.drawImage(qr, {
    x: (width - size) / 2,
    y: height - 215 - size,
    width: size,
    height: size,
  });

  centered("¿Cómo fue tu estadía?", 230, 30, bold);
  centered("Escanea el código con la cámara de tu celular", 190, 16, regular, MUTED);
  centered("y cuéntanos en 1 minuto. Tu opinión nos ayuda a mejorar.", 168, 16, regular, MUTED);
  centered(input.url.replace(/^https?:\/\//, ""), 70, 9, regular, MUTED);

  pdf.setTitle(`QR encuesta · ${input.unitName} · ${input.roomName}`);
  return pdf.save();
}
