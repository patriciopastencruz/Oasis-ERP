import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type CollectionStatementOrder = {
  order_number: string;
  created_at: string;
  total: number;
  paid: number;
  balance: number;
  products: string;
};

type CollectionStatementInput = {
  customer: {
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  orders: CollectionStatementOrder[];
  selectedOnly: boolean;
  issuedAt?: Date;
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

export async function buildCollectionStatementPdf({
  customer,
  orders,
  selectedOnly,
  issuedAt = new Date(),
}: CollectionStatementInput) {
  const total = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const paid = orders.reduce((sum, order) => sum + order.paid, 0);
  const balance = total - paid;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.03, 0.2, 0.42);
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
      ["Fecha pedido", 52],
      ["Pedido", 116],
      ["Productos / cantidad", 178],
      ["Total", 380],
      ["Saldo", 470],
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
    page.drawText("OASIS ERP - Estado de pago", {
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
  page.drawText("OASIS ERP", {
    x: 44,
    y: 807,
    size: 19,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("DISTRIBUIDORA ALTIPLANICA - ESTADO DE PAGO", {
    x: 44,
    y: 782,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y = 724;
  draw(`Cliente: ${customer.name}`, 44, 15, bold, primary);
  y -= 22;
  draw(
    `Codigo: ${customer.code}   Emision: ${issuedAt.toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`,
    44,
    9,
    regular,
    muted,
  );
  y -= 17;
  draw(
    `Direccion: ${customer.address ?? "—"}   Telefono: ${customer.phone ?? "—"}`,
    44,
    9,
    regular,
    muted,
  );
  y -= 35;
  page.drawRectangle({
    x: 44,
    y: y - 48,
    width: 507,
    height: 64,
    color: rgb(0.95, 0.97, 0.96),
  });
  draw("TOTAL VENDIDO", 60, 8, bold, muted);
  draw("TOTAL ABONADO", 230, 8, bold, muted);
  draw("SALDO PENDIENTE", 400, 8, bold, muted);
  y -= 25;
  draw(money(total), 60, 16, bold, primary);
  draw(money(paid), 230, 16, bold, primary);
  draw(
    money(balance),
    400,
    16,
    bold,
    balance > 0 ? rgb(0.7, 0.2, 0.1) : primary,
  );
  y -= 55;
  draw(
    selectedOnly
      ? "PEDIDOS SELECCIONADOS PARA COBRANZA"
      : "DETALLE DE OPERACIONES",
    44,
    11,
    bold,
    primary,
  );
  y -= 24;
  drawTableHeader();

  for (const order of orders) {
    const productLines = wrapText(
      order.products || "Sin detalle",
      188,
      regular,
      7,
    );
    const rowHeight = Math.max(24, productLines.length * 10 + 8);
    if (y - rowHeight < 60) nextPage();
    draw(
      new Date(order.created_at).toLocaleDateString("es-CL", {
        timeZone: "America/Santiago",
      }),
      52,
      8,
    );
    draw(order.order_number, 116, 8, bold);
    productLines.forEach((line, index) => {
      page.drawText(line, {
        x: 178,
        y: y - index * 10,
        size: 7,
        font: regular,
        color: rgb(0.08, 0.12, 0.1),
      });
    });
    draw(money(Number(order.total)), 380, 8);
    draw(
      money(order.balance),
      470,
      8,
      bold,
      order.balance > 0 ? rgb(0.65, 0.18, 0.12) : primary,
    );
    y -= rowHeight;
    page.drawLine({
      start: { x: 44, y: y + 7 },
      end: { x: 551, y: y + 7 },
      thickness: 0.5,
      color: rgb(0.87, 0.9, 0.88),
    });
  }
  if (!orders.length) {
    draw(
      "No existen pedidos a credito para este cliente.",
      52,
      9,
      regular,
      muted,
    );
    y -= 20;
  }
  y = Math.max(y - 30, 45);
  draw(
    "Documento emitido por OASIS ERP. Los pagos posteriores a la emision pueden no estar reflejados.",
    44,
    8,
    regular,
    muted,
  );
  return pdf.save();
}
