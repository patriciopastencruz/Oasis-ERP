import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import {
  cashFlowContext,
  loadMonth,
} from "@/modules/finance/cash-flow/application/queries";
import {
  chileToday,
  kindLabels,
  paymentMethods,
  resolveMonth,
  summarizeMonth,
} from "@/modules/finance/cash-flow/domain/cash-flow";

const header = (sheet: ExcelJS.Worksheet) => {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B356D" } };
};

export async function GET(request: NextRequest) {
  const { unit, supabase } = await cashFlowContext();
  const today = chileToday();
  const month = resolveMonth(request.nextUrl.searchParams.get("month") ?? undefined, today);
  const { entries, closings } = await loadMonth(supabase, unit.id, month);
  const summary = summarizeMonth(month, entries, closings, today);
  const workbook = new ExcelJS.Workbook();

  const resume = workbook.addWorksheet("Resumen");
  resume.columns = [
    { header: "Concepto", key: "label", width: 34 },
    { header: "Monto CLP", key: "amount", width: 18 },
  ];
  resume.addRows([
    { label: `Unidad: ${unit.name}`, amount: null },
    { label: `Mes: ${month}`, amount: null },
    { label: "Ingresos", amount: summary.totals.income },
    { label: "Gastos", amount: summary.totals.expense },
    { label: "Utilidad", amount: summary.totals.net },
    { label: "", amount: null },
    ...summary.incomeCategories.map((c) => ({ label: `Ingreso · ${c.name}`, amount: c.amount })),
    ...summary.expenseCategories.map((c) => ({ label: `Gasto · ${c.name}`, amount: c.amount })),
  ]);
  resume.getColumn("amount").numFmt = "#,##0";
  header(resume);

  const daily = workbook.addWorksheet("Diario", { views: [{ state: "frozen", ySplit: 1 }] });
  daily.columns = [
    { header: "Fecha", key: "date", width: 14 },
    { header: "Ingresos", key: "income", width: 16 },
    { header: "Gastos", key: "expense", width: 16 },
    { header: "Resultado", key: "net", width: 16 },
    { header: "Cierre", key: "status", width: 14 },
  ];
  summary.days.forEach((d) =>
    daily.addRow({
      ...d,
      status: d.status === "closed" ? "Cerrado" : d.entries ? "Pendiente" : "Sin movimientos",
    }),
  );
  ["income", "expense", "net"].forEach((key) => (daily.getColumn(key).numFmt = "#,##0"));
  header(daily);

  const detail = workbook.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [
    { header: "Fecha", key: "entry_date", width: 14 },
    { header: "Tipo", key: "kind", width: 10 },
    { header: "Categoría", key: "category_name", width: 26 },
    { header: "Descripción", key: "description", width: 40 },
    { header: "Medio de pago", key: "payment_method", width: 18 },
    { header: "N.º documento", key: "reference", width: 16 },
    { header: "Monto CLP", key: "amount", width: 16 },
    { header: "Registrado por", key: "created_by_name", width: 24 },
  ];
  entries.forEach((e) =>
    detail.addRow({
      ...e,
      kind: kindLabels[e.kind],
      payment_method: paymentMethods[e.payment_method],
    }),
  );
  detail.getColumn("amount").numFmt = "#,##0";
  detail.autoFilter = { from: "A1", to: "H1" };
  header(detail);

  const bytes = await workbook.xlsx.writeBuffer();
  return new Response(bytes as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename=flujo-caja-${month}.xlsx`,
    },
  });
}
