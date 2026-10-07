import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lodgingUnitCodes } from "@/config/business-units";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  HISTORY_RESERVATION_SELECT,
  auditLabels,
  mapHistoryReservations,
  originLabels,
  parseHistoryMonth,
  receiptReviewLabels,
  shiftMonth,
} from "@/modules/lodging/domain/history-report";
import { uiLabel } from "@/lib/ui-labels";

const santiagoDateTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  dateStyle: "short",
  timeStyle: "short",
  hour12: false,
});

function dateCell(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

export async function GET(req: NextRequest) {
  const ctx = await requirePermission("lodging.reservations.view");
  const selected = req.cookies.get("oasis_unit")?.value;
  const unit =
    ctx.units.find(
      (u) => u.id === selected && lodgingUnitCodes.includes(u.code),
    ) ?? ctx.units.find((u) => lodgingUnitCodes.includes(u.code));
  if (!unit) return Response.json({ error: "Sin unidad" }, { status: 403 });

  const month = parseHistoryMonth(req.nextUrl.searchParams.get("month"));
  const reviewOnly = req.nextUrl.searchParams.get("review") === "issues";
  const s = await createSupabaseServerClient();
  const { data, error } = await s
    .from("lodging_reservations")
    .select(HISTORY_RESERVATION_SELECT)
    .eq("business_unit_id", unit.id)
    .gte("check_in", `${month}-01`)
    .lt("check_in", `${shiftMonth(month, 1)}-01`)
    .order("check_in", { ascending: false });
  if (error) {
    console.error("No fue posible exportar el historial de reservas", {
      code: error.code,
      month,
    });
    return Response.json({ error: "No fue posible exportar" }, { status: 500 });
  }

  const all = mapHistoryReservations(data ?? []);
  const rows = reviewOnly ? all.filter((r) => r.auditStatus !== "ok") : all;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Historial ${month}`, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const money = '"$"#,##0';
  ws.columns = [
    { header: "Control de precio", key: "audit", width: 22 },
    { header: "Diferencia", key: "difference", width: 14, style: { numFmt: money } },
    { header: "Huésped", key: "guest", width: 28 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Empresa", key: "company", width: 22 },
    { header: "Habitación", key: "room", width: 20 },
    { header: "Origen", key: "origin", width: 14 },
    { header: "Estado", key: "status", width: 16 },
    { header: "Personas", key: "guests", width: 10 },
    { header: "Registrada", key: "created", width: 18 },
    { header: "Check-in", key: "checkIn", width: 12, style: { numFmt: "dd-mm-yyyy" } },
    { header: "Check-out", key: "checkOut", width: 12, style: { numFmt: "dd-mm-yyyy" } },
    { header: "Noches", key: "nights", width: 9 },
    { header: "Tarifa/noche", key: "rate", width: 14, style: { numFmt: money } },
    { header: "Descuento", key: "discount", width: 13, style: { numFmt: money } },
    { header: "Recargo", key: "surcharge", width: 13, style: { numFmt: money } },
    { header: "Comisión", key: "commission", width: 13, style: { numFmt: money } },
    { header: "Total calculado", key: "expected", width: 16, style: { numFmt: money } },
    { header: "Total registrado", key: "registered", width: 16, style: { numFmt: money } },
    { header: "Pagado", key: "paid", width: 14, style: { numFmt: money } },
    { header: "Comprobantes", key: "receipts", width: 14 },
    { header: "Revisión IA", key: "review", width: 18 },
    { header: "Monto pago (IA)", key: "reviewPayment", width: 16, style: { numFmt: money } },
    { header: "Monto leído por IA", key: "reviewDetected", width: 18, style: { numFmt: money } },
    { header: "Observación IA", key: "reviewNotes", width: 40 },
  ];
  for (const r of rows) {
    const issue = r.receiptReview.issue;
    ws.addRow({
      audit: auditLabels[r.auditStatus],
      difference: r.difference === null ? null : r.difference,
      guest: r.guest?.full_name ?? "Sin identificar",
      phone: r.guest?.phone ?? "",
      company: r.company_name ?? "",
      room: r.room?.name ?? "",
      origin: originLabels[r.origin] ?? r.origin,
      status: uiLabel(r.status),
      guests: r.guest_count,
      created: santiagoDateTime.format(new Date(r.created_at)),
      checkIn: dateCell(r.check_in),
      checkOut: dateCell(r.check_out),
      nights: r.nights,
      rate: Number(r.nightly_rate),
      discount: Number(r.discount),
      surcharge: Number(r.surcharge),
      commission: Number(r.commission),
      expected: r.expectedTotal,
      registered: r.registeredTotal,
      paid: r.paid,
      receipts: r.receiptReview.receiptCount,
      review: receiptReviewLabels[r.receiptReview.status],
      reviewPayment: issue?.paymentAmount ?? null,
      reviewDetected: issue?.detectedAmount ?? null,
      reviewNotes: issue?.ai_notes ?? "",
    });
  }
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B4F9C" },
  };
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };

  const bytes = await wb.xlsx.writeBuffer();
  return new Response(bytes as ArrayBuffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename=oasis-historial-reservas-${month}${reviewOnly ? "-por-revisar" : ""}.xlsx`,
    },
  });
}
