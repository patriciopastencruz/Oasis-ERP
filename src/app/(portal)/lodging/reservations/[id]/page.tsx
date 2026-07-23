import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import {
  lodgingContext,
  formatDate,
  clp,
} from "@/modules/lodging/application/queries";
import {
  checkInAction,
  checkOutAction,
  registerPaymentAction,
  uploadPaymentReceiptAction,
  openPaymentReceiptAction,
  voidPaymentAction,
  updateImportedReservationInfoAction,
} from "@/modules/lodging/application/actions";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params,
    q = await searchParams;
  const { supabase, ctx, unit } = await lodgingContext();
  const { data: r } = await supabase
    .from("lodging_reservations")
    .select("*,lodging_rooms(name),lodging_guests(*)")
    .eq("id", id)
    .single();
  if (!r) notFound();
  const [{ data: payments }, { data: summary }] = await Promise.all([
    supabase
      .from("lodging_reservation_payments")
      .select("*,lodging_payment_receipts(*)")
      .eq("reservation_id", id)
      .order("paid_at"),
    supabase.rpc("lodging_payment_summary", { target_reservation: id }),
  ]);
  const s = summary?.[0] ?? {
    total_paid: 0,
    balance: r.total_value,
    payment_status: "pending",
  };
  const guest = Array.isArray(r.lodging_guests)
      ? r.lodging_guests[0]
      : r.lodging_guests,
    room = Array.isArray(r.lodging_rooms)
      ? r.lodging_rooms[0]
      : r.lodging_rooms;
  const field = "rounded-xl border px-3 py-2 text-sm";
  return (
    <>
      <PageHeader
        eyebrow={`${unit.name} · Reserva`}
        title={
          guest?.full_name || `Reserva ${r.origin} — información pendiente`
        }
        description={`${room?.name} · ${formatDate(r.check_in)} → ${formatDate(r.check_out)}`}
      />
      {q.success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
          {q.success}
        </p>
      )}
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      {r.imported_from_ical && (
        <p className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Esta reserva proviene de Booking/Airbnb. Los cambios de la reserva
          original deben realizarse en la plataforma de origen.
        </p>
      )}
      {r.imported_from_ical && guest && (
        <Panel className="mb-4">
          <h2 className="font-semibold">Completar información interna</h2>
          <p className="mt-1 text-xs text-slate-500">
            Estos datos quedan solo en Oasis y no se envían al canal.
          </p>
          <form
            action={updateImportedReservationInfoAction}
            className="mt-4 grid gap-3 md:grid-cols-4"
          >
            <input type="hidden" name="reservation_id" value={id} />
            <input type="hidden" name="guest_id" value={guest.id} />
            <input
              name="full_name"
              required
              defaultValue={guest.full_name}
              placeholder="Nombre del huésped"
              className={field}
            />
            <input
              name="phone"
              required
              defaultValue={guest.phone}
              placeholder="Teléfono"
              className={field}
            />
            <input
              name="email"
              type="email"
              defaultValue={guest.email ?? ""}
              placeholder="Correo"
              className={field}
            />
            <input
              name="document"
              defaultValue={guest.document ?? ""}
              placeholder="Documento"
              className={field}
            />
            <input
              name="guest_count"
              type="number"
              min="1"
              defaultValue={r.guest_count}
              className={field}
            />
            <input
              name="total_value"
              type="number"
              min="0"
              defaultValue={r.total_value}
              placeholder="Valor total"
              className={field}
            />
            <input
              name="commission"
              type="number"
              min="0"
              defaultValue={r.commission}
              placeholder="Comisión"
              className={field}
            />
            <input
              name="estimated_arrival"
              type="time"
              defaultValue={r.estimated_arrival ?? ""}
              className={field}
            />
            <input
              name="company_name"
              defaultValue={r.company_name ?? ""}
              placeholder="Empresa"
              className={field}
            />
            <input
              name="license_plate"
              defaultValue={r.license_plate ?? ""}
              placeholder="Patente"
              className={field}
            />
            <input
              name="notes"
              defaultValue={r.notes ?? ""}
              placeholder="Observaciones"
              className={`${field} md:col-span-2`}
            />
            <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white md:col-span-4">
              Guardar información interna
            </button>
          </form>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-semibold">Resumen de la estadía</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Origen</dt>
              <dd className="font-semibold capitalize">{r.origin}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Personas</dt>
              <dd>{r.guest_count}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Teléfono</dt>
              <dd>{guest?.phone || "Pendiente"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Llegada estimada</dt>
              <dd>{r.estimated_arrival || "Sin informar"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Observaciones</dt>
              <dd>{r.notes || "Sin observaciones"}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {r.status === "confirmed" && (
              <form action={checkInAction}>
                <input type="hidden" name="reservation_id" value={id} />
                <input type="hidden" name="room_id" value={r.room_id} />
                <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white">
                  Realizar check-in
                </button>
              </form>
            )}
            {r.status === "checked_in" && (
              <form action={checkOutAction}>
                <input type="hidden" name="reservation_id" value={id} />
                <input type="hidden" name="room_id" value={r.room_id} />
                <button className="rounded-xl bg-[#173f2d] px-4 py-2 text-sm font-semibold text-white">
                  Realizar check-out
                </button>
              </form>
            )}
            <Link
              href={`/lodging/reservations/new?check_in=${r.check_out}&main_reservation_id=${id}&stay_group_id=${r.stay_group_id}&relation_type=extension`}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Extender estadía
            </Link>
          </div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Estado del pago</h2>
          <b className="mt-3 block text-2xl">
            {clp.format(Number(s.total_paid))}
          </b>
          <p className="text-sm text-slate-500">
            de {clp.format(Number(r.total_value))}
          </p>
          <p className="mt-3 rounded-lg bg-slate-100 p-2 text-sm">
            Saldo: <b>{clp.format(Number(s.balance))}</b>
          </p>
          <p className="mt-2 text-xs capitalize text-slate-500">
            {uiLabel(s.payment_status)}
          </p>
        </Panel>
      </div>
      <Panel className="mt-4">
        <h2 className="font-semibold">Registrar nuevo pago</h2>
        <form
          action={registerPaymentAction}
          className="mt-4 grid gap-3 md:grid-cols-4"
        >
          <input type="hidden" name="reservation_id" value={id} />
          <input type="hidden" name="company_id" value={r.company_id} />
          <input
            type="hidden"
            name="business_unit_id"
            value={r.business_unit_id}
          />
          <select name="type" className={field}>
            <option value="partial">Pago parcial</option>
            <option value="total">Pago total</option>
            <option value="check_in">Pago de check-in</option>
            <option value="check_out">Pago de check-out</option>
            <option value="refund">Devolución</option>
          </select>
          <select name="payment_method" className={field}>
            <option value="transfer">Transferencia</option>
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="booking">Booking</option>
            <option value="airbnb">Airbnb</option>
            <option value="company">Empresa</option>
            <option value="other">Otro</option>
          </select>
          <input
            name="amount"
            type="number"
            min="1"
            required
            placeholder="Monto"
            className={field}
          />
          <input
            name="paid_at"
            type="datetime-local"
            required
            className={field}
          />
          <input
            name="operation_number"
            placeholder="Nº operación"
            className={field}
          />
          <input name="bank" placeholder="Banco" className={field} />
          <input name="notes" placeholder="Observación" className={field} />
          <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white">
            Registrar pago
          </button>
        </form>
        <div className="mt-6 space-y-3">
          {(payments ?? []).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <div>
                <b>{clp.format(Number(p.amount))}</b>
                <span className="ml-2 capitalize text-slate-500">
                  {uiLabel(p.type)} · {uiLabel(p.payment_method)}
                </span>
                <span className="block text-xs text-slate-400">
                  {new Intl.DateTimeFormat("es-CL", {
                    timeZone: "America/Santiago",
                    dateStyle: "short",
                    timeStyle: "short",
                    hour12: false,
                  }).format(new Date(p.paid_at))}
                </span>
              </div>
              <div className="flex gap-2">
                {(p.lodging_payment_receipts ?? []).map(
                  (receipt: {
                    id: string;
                    private_path: string;
                    original_name: string;
                  }) => (
                    <form key={receipt.id} action={openPaymentReceiptAction}>
                      <input
                        type="hidden"
                        name="path"
                        value={receipt.private_path}
                      />
                      <button className="text-xs font-semibold text-[#1c6748]">
                        Ver {receipt.original_name}
                      </button>
                    </form>
                  ),
                )}
                <form
                  action={uploadPaymentReceiptAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="payment_id" value={p.id} />
                  <input type="hidden" name="reservation_id" value={id} />
                  <input type="hidden" name="company_id" value={r.company_id} />
                  <input
                    type="hidden"
                    name="business_unit_id"
                    value={r.business_unit_id}
                  />
                  <input
                    name="receipt"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    required
                    className="max-w-40 text-xs"
                  />
                  <button className="rounded-lg border px-2 py-1 text-xs">
                    Adjuntar
                  </button>
                </form>
                {ctx.permissions.has("lodging.payments.void") &&
                  p.status === "confirmed" && (
                    <form
                      action={voidPaymentAction}
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="payment_id" value={p.id} />
                      <input type="hidden" name="reservation_id" value={id} />
                      <input
                        name="void_reason"
                        required
                        minLength={3}
                        placeholder="Motivo"
                        className="w-24 rounded-lg border px-2 py-1 text-xs"
                      />
                      <button className="text-xs font-semibold text-red-600">
                        Anular
                      </button>
                    </form>
                  )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
