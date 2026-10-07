import Link from "next/link";
import { after } from "next/server";
import {
  AlertTriangle,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ReceiptText,
} from "lucide-react";
import { LodgingReportTabs } from "@/components/lodging/report-tabs";
import { ReceiptReviewRefresh } from "@/components/lodging/receipt-review-refresh";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import {
  clp,
  formatDate,
  lodgingContext,
} from "@/modules/lodging/application/queries";
import {
  auditReservationPrice,
  type PriceAuditStatus,
} from "@/modules/lodging/domain/reservation-price-audit";
import { reviewPendingPaymentReceipts } from "@/modules/lodging/application/receipt-ai-review";
import {
  summarizeReceiptReviews,
  type ReceiptPaymentRow,
  type ReservationReceiptStatus,
} from "@/modules/lodging/domain/receipt-ai-review";

export const maxDuration = 60;

const auditLabels: Record<PriceAuditStatus, string> = {
  ok: "Precio correcto",
  missing_price: "Sin precio",
  missing_rate: "Solo total informado",
  mismatch: "Diferencia de precio",
};

const auditStyles: Record<PriceAuditStatus, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  missing_price: "bg-red-50 text-red-700",
  missing_rate: "bg-amber-50 text-amber-800",
  mismatch: "bg-red-50 text-red-700",
};

const originLabels: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking",
  direct: "Directa",
  whatsapp: "WhatsApp",
  company: "Empresa",
  public_web: "Sitio web",
  maintenance: "Mantención",
  other: "Otro",
};

const receiptReviewLabels: Record<ReservationReceiptStatus, string> = {
  missing: "Sin comprobante",
  pending: "Pendiente IA",
  matched: "Monto coincide",
  mismatch: "Monto diferente",
  unreadable: "Revisión manual",
  error: "Error de revisión",
};

const receiptReviewStyles: Record<ReservationReceiptStatus, string> = {
  missing: "bg-slate-100 text-slate-700",
  pending: "bg-amber-50 text-amber-800",
  matched: "bg-emerald-50 text-emerald-700",
  mismatch: "bg-red-50 text-red-700",
  unreadable: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
};

function currentMonthInSantiago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-15T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function ReservationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; review?: string }>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await lodgingContext(
    "lodging.reservations.view",
  );
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "")
    ? q.month!
    : currentMonthInSantiago();
  const reviewOnly = q.review === "issues";
  const monthStart = `${month}-01`;
  const nextMonth = shiftMonth(month, 1);

  const loadReservations = () =>
    supabase
      .from("lodging_reservations")
      .select(
        "id,status,origin,created_at,check_in,check_out,nights,guest_count,nightly_rate,discount,surcharge,total_value,commission,company_name,information_complete,lodging_rooms(name),lodging_guests(full_name,phone),lodging_reservation_payments(amount,type,status,lodging_payment_receipts(id,deleted_at,ai_review_status,ai_detected_amount,ai_confidence,ai_notes))",
      )
      .eq("business_unit_id", unit.id)
      .gte("check_in", monthStart)
      .lt("check_in", `${nextMonth}-01`)
      .order("check_in", { ascending: false });
  let result = await loadReservations();
  // PGRST003 es un agotamiento transitorio del pool de conexiones. Un segundo
  // intento evita convertir ese evento puntual en una pantalla de error.
  if (result.error?.code === "PGRST003") result = await loadReservations();
  const { data, error } = result;

  if (error) {
    console.error("No fue posible cargar el historial de reservas", {
      code: error.code,
      unit: unit.code,
      month,
    });
    return (
      <>
        <LodgingReportTabs active="history" permissions={ctx.permissions} />
        <PageHeader
          eyebrow={unit.name}
          title="Historial de reservas"
          description="Audita tarifas y totales registrados para detectar reservas sin precio o diferencias de cobro."
        />
        <Panel className="mt-4 border-amber-200 bg-amber-50 text-center">
          <h2 className="font-semibold text-amber-900">
            No pudimos consultar el historial en este momento
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            La conexión con la base de datos no respondió. Puedes volver a
            intentarlo sin perder información.
          </p>
          <Link
            href={`/lodging/reports/history?month=${month}${reviewOnly ? "&review=issues" : ""}`}
            className="mt-4 inline-flex rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white"
          >
            Intentar nuevamente
          </Link>
        </Panel>
      </>
    );
  }

  const reservations = (data ?? []).map((reservation) => {
    const payments = (reservation.lodging_reservation_payments ??
      []) as ReceiptPaymentRow[];
    const audit = auditReservationPrice({
      nights: reservation.nights,
      nightlyRate: reservation.nightly_rate,
      discount: reservation.discount,
      surcharge: reservation.surcharge,
      totalValue: reservation.total_value,
      payments,
    });
    const { status: auditStatus, ...priceAudit } = audit;
    const guest = Array.isArray(reservation.lodging_guests)
      ? reservation.lodging_guests[0]
      : reservation.lodging_guests;
    const room = Array.isArray(reservation.lodging_rooms)
      ? reservation.lodging_rooms[0]
      : reservation.lodging_rooms;
    const receiptReview = summarizeReceiptReviews(payments);
    return {
      ...reservation,
      ...priceAudit,
      auditStatus,
      receiptReview,
      guest,
      room,
    };
  });

  // La revisión con IA corre sola: los comprobantes del mes que aún no
  // tienen resultado se leen en segundo plano al abrir el informe y la
  // página se actualiza hasta mostrarlos.
  const pendingReceiptIds = (data ?? []).flatMap((reservation) =>
    (
      (reservation.lodging_reservation_payments ?? []) as ReceiptPaymentRow[]
    )
      .filter((payment) => payment.status !== "voided")
      .flatMap((payment) =>
        (Array.isArray(payment.lodging_payment_receipts)
          ? payment.lodging_payment_receipts
          : payment.lodging_payment_receipts
            ? [payment.lodging_payment_receipts]
            : []
        )
          .filter(
            (receipt) =>
              !receipt.deleted_at &&
              ["pending", "error"].includes(receipt.ai_review_status),
          )
          .map((receipt) => receipt.id),
      ),
  );
  if (pendingReceiptIds.length)
    after(() =>
      reviewPendingPaymentReceipts({
        receiptIds: pendingReceiptIds,
        limit: 30,
        concurrency: 5,
      }),
    );
  const hasPendingReview = reservations.some(
    (reservation) => reservation.receiptReview.status === "pending",
  );

  const visible = reviewOnly
    ? reservations.filter((reservation) => reservation.auditStatus !== "ok")
    : reservations;
  const activeReservations = reservations.filter(
    (reservation) => !["cancelled", "conflict"].includes(reservation.status),
  );
  const registeredTotal = activeReservations.reduce(
    (total, reservation) => total + reservation.registeredTotal,
    0,
  );
  const paidTotal = activeReservations.reduce(
    (total, reservation) => total + reservation.paid,
    0,
  );
  const issues = reservations.filter(
    (reservation) => reservation.auditStatus !== "ok",
  );
  const cards = [
    ["Reservas del mes", String(reservations.length), BedDouble],
    ["Total registrado", clp.format(registeredTotal), ReceiptText],
    ["Pagos confirmados", clp.format(paidTotal), CircleDollarSign],
    ["Precios por revisar", String(issues.length), AlertTriangle],
  ] as const;
  const makeHref = (targetMonth: string, issuesOnly = reviewOnly) =>
    `/lodging/reports/history?month=${targetMonth}${issuesOnly ? "&review=issues" : ""}`;

  return (
    <>
      <LodgingReportTabs active="history" permissions={ctx.permissions} />
      {hasPendingReview && <ReceiptReviewRefresh />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Historial de reservas"
          description="Audita tarifas y totales registrados para detectar reservas sin precio o diferencias de cobro."
        />
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2">
          <Link
            href={makeHref(shiftMonth(month, -1))}
            aria-label="Mes anterior"
            className="grid size-9 place-items-center rounded-lg border"
          >
            <ChevronLeft size={17} />
          </Link>
          <form className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border px-2 py-1.5 text-sm"
            />
            {reviewOnly && <input type="hidden" name="review" value="issues" />}
            <button className="rounded-lg bg-[#0b4f9c] px-3 py-1.5 text-sm font-semibold text-white">
              Ver
            </button>
          </form>
          <Link
            href={makeHref(shiftMonth(month, 1))}
            aria-label="Mes siguiente"
            className="grid size-9 place-items-center rounded-lg border"
          >
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>

      <div className="mb-5 mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#d9dfe6] bg-white p-4 shadow-[0_10px_30px_rgba(20,57,39,.04)]"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-[#0b4f9c]">
              <Icon size={17} />
            </span>
            <b className="mt-3 block text-2xl leading-none text-slate-800">
              {value}
            </b>
            <span className="mt-1.5 block text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={makeHref(month, false)}
          className={`rounded-full border px-3 py-1.5 font-medium ${
            !reviewOnly
              ? "border-[#0b4f9c] bg-[#0b4f9c] text-white"
              : "bg-white"
          }`}
        >
          Todas
        </Link>
        <Link
          href={makeHref(month, true)}
          className={`rounded-full border px-3 py-1.5 font-medium ${
            reviewOnly
              ? "border-red-600 bg-red-600 text-white"
              : "bg-white hover:border-red-400"
          }`}
        >
          Solo precios por revisar
        </Link>
        <span className="ml-auto text-sm font-semibold text-slate-700">
          {monthLabel(month)} · {visible.length} registros
        </span>
      </div>

      <Panel>
        <div>
          <h2 className="font-semibold">Detalle de precios y cobros</h2>
          <p className="mt-1 text-xs text-slate-500">
            Total calculado = noches × tarifa − descuento + recargo. Las
            reservas anuladas permanecen visibles, pero no suman en los
            indicadores monetarios.
          </p>
        </div>

        {visible.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1600px] text-left text-sm">
              <thead className="border-y bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Control</th>
                  <th className="px-3 py-2">Huésped</th>
                  <th className="px-3 py-2">Reserva</th>
                  <th className="px-3 py-2">Estadía</th>
                  <th className="px-3 py-2 text-right">Tarifa/noche</th>
                  <th className="px-3 py-2 text-right">Ajustes</th>
                  <th className="px-3 py-2 text-right">Calculado</th>
                  <th className="px-3 py-2 text-right">Registrado</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2">Comprobante</th>
                  <th className="px-3 py-2">Revisión IA</th>
                  <th className="px-3 py-2 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${auditStyles[reservation.auditStatus]}`}
                      >
                        {auditLabels[reservation.auditStatus]}
                      </span>
                      {reservation.difference !== null &&
                        Math.abs(reservation.difference) > 0.5 && (
                          <span className="mt-1 block text-xs font-semibold text-red-600">
                            {reservation.difference > 0
                              ? `${clp.format(reservation.difference)} de más`
                              : `${clp.format(Math.abs(reservation.difference))} de menos`}
                          </span>
                        )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <b className="block text-slate-800">
                        {reservation.guest?.full_name ?? "Sin identificar"}
                      </b>
                      <span className="block text-xs text-slate-500">
                        {reservation.guest?.phone || "Sin teléfono"}
                      </span>
                      {reservation.company_name && (
                        <span className="block text-xs text-slate-400">
                          {reservation.company_name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <b className="block">{reservation.room?.name ?? "—"}</b>
                      <span className="block text-xs text-slate-500">
                        {originLabels[reservation.origin] ?? reservation.origin}
                        {" · "}
                        {uiLabel(reservation.status)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {reservation.guest_count} personas
                      </span>
                      <span className="block text-xs text-slate-400">
                        Registrada {formatDate(reservation.created_at)}
                      </span>
                      {!reservation.information_complete && (
                        <span className="block text-xs font-medium text-amber-700">
                          Información pendiente
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <span className="block">
                        {formatDate(reservation.check_in)}
                      </span>
                      <span className="block text-slate-500">
                        al {formatDate(reservation.check_out)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {reservation.nights}{" "}
                        {reservation.nights === 1 ? "noche" : "noches"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">
                      {clp.format(Number(reservation.nightly_rate))}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-xs tabular-nums">
                      <span className="block text-red-600">
                        − {clp.format(Number(reservation.discount))}
                      </span>
                      <span className="block text-emerald-700">
                        + {clp.format(Number(reservation.surcharge))}
                      </span>
                      {Number(reservation.commission) > 0 && (
                        <span className="block text-slate-500">
                          Comisión: {clp.format(Number(reservation.commission))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-medium tabular-nums">
                      {reservation.expectedTotal === null
                        ? "No calculable"
                        : clp.format(reservation.expectedTotal)}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-bold tabular-nums">
                      {clp.format(reservation.registeredTotal)}
                    </td>
                    <td className="px-3 py-3 text-right align-top tabular-nums text-emerald-700">
                      {clp.format(reservation.paid)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {reservation.receiptReview.receiptCount > 0 ? (
                        <span className="font-semibold text-emerald-700">
                          Sí · {reservation.receiptReview.receiptCount}{" "}
                          {reservation.receiptReview.receiptCount === 1
                            ? "archivo"
                            : "archivos"}
                        </span>
                      ) : (
                        <span className="font-semibold text-red-600">
                          No subido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${receiptReviewStyles[reservation.receiptReview.status]}`}
                      >
                        {receiptReviewLabels[reservation.receiptReview.status]}
                      </span>
                      {reservation.receiptReview.status === "mismatch" &&
                        reservation.receiptReview.issue && (
                          <span className="mt-1 block text-xs text-red-600">
                            Pago{" "}
                            {clp.format(
                              reservation.receiptReview.issue.paymentAmount,
                            )}{" "}
                            · IA{" "}
                            {reservation.receiptReview.issue.detectedAmount ===
                            null
                              ? "sin monto"
                              : clp.format(
                                  reservation.receiptReview.issue
                                    .detectedAmount,
                                )}
                          </span>
                        )}
                    </td>
                    <td className="px-3 py-3 text-right align-top">
                      <Link
                        href={`/lodging/reservations/${reservation.id}`}
                        className="inline-flex rounded-lg border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c] hover:bg-[#edf4fc]"
                      >
                        Ver reserva
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
            No hay reservas para este mes y filtro.
          </div>
        )}
      </Panel>
    </>
  );
}
