import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";
import { createReservationAction } from "@/modules/lodging/application/actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext(
    "lodging.reservations.manage",
  );
  const { data: rooms } = await supabase
    .from("lodging_rooms")
    .select("id,name,capacity,base_rate")
    .eq("business_unit_id", unit.id)
    .eq("active", true)
    .not("status", "in", '("maintenance","out_of_service")')
    .order("display_order");
  const { data: parent } = q.main_reservation_id
    ? await supabase
        .from("lodging_reservations")
        .select("room_id,lodging_guests(full_name,phone,email,document)")
        .eq("id", q.main_reservation_id)
        .maybeSingle()
    : { data: null };
  const parentGuest = parent
    ? Array.isArray(parent.lodging_guests)
      ? parent.lodging_guests[0]
      : parent.lodging_guests
    : null;
  const selectedRoom =
    rooms?.find((r) => r.id === parent?.room_id) ?? rooms?.[0];
  const field =
    "rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#277a55]";
  return (
    <>
      <PageHeader
        eyebrow="Hostal Uruguay · Gestión de reservas"
        title="Nueva reserva"
        description="Registra una reserva directa, WhatsApp o empresa. La disponibilidad se verifica nuevamente en el servidor al guardar."
      />
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}
      <Panel>
        <form
          action={createReservationAction}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <label className="text-sm font-medium">
            Habitación
            <select
              name="room_id"
              required
              defaultValue={selectedRoom?.id}
              className={`mt-1 block w-full ${field}`}
            >
              {(rooms ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {clp.format(Number(r.base_rate))} · {r.capacity}{" "}
                  personas
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Entrada
            <input
              name="check_in"
              type="date"
              defaultValue={q.check_in}
              required
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Salida
            <input
              name="check_out"
              type="date"
              defaultValue={q.check_out}
              required
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Nombre del huésped
            <input
              name="guest_name"
              required
              defaultValue={parentGuest?.full_name ?? ""}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Teléfono
            <input
              name="phone"
              required
              defaultValue={parentGuest?.phone ?? ""}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Personas
            <input
              name="guest_count"
              type="number"
              min="1"
              defaultValue="1"
              required
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Origen
            <select name="origin" className={`mt-1 block w-full ${field}`}>
              <option value="direct">Directa</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="company">Empresa</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Tarifa por noche
            <input
              name="nightly_rate"
              type="number"
              min="0"
              defaultValue={selectedRoom?.base_rate ?? 0}
              required
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Hora aproximada
            <input
              name="estimated_arrival"
              type="time"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Descuento
            <input
              name="discount"
              type="number"
              min="0"
              defaultValue="0"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Recargo
            <input
              name="surcharge"
              type="number"
              min="0"
              defaultValue="0"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Empresa
            <input
              name="company_name"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Correo
            <input
              name="email"
              type="email"
              defaultValue={parentGuest?.email ?? ""}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Documento
            <input
              name="document"
              defaultValue={parentGuest?.document ?? ""}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium">
            Patente
            <input
              name="license_plate"
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
            Observaciones
            <textarea
              name="notes"
              rows={3}
              className={`mt-1 block w-full ${field}`}
            />
          </label>
          <input type="hidden" name="guest_notes" value="" />
          <input
            type="hidden"
            name="main_reservation_id"
            value={q.main_reservation_id ?? ""}
          />
          <input
            type="hidden"
            name="stay_group_id"
            value={q.stay_group_id ?? ""}
          />
          <input
            type="hidden"
            name="relation_type"
            value={q.relation_type ?? ""}
          />
          <fieldset className="rounded-xl border p-4 md:col-span-2 xl:col-span-3">
            <legend className="px-2 text-sm font-semibold">
              ¿Desea registrar un pago ahora?
            </legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label>
                <input
                  type="radio"
                  name="payment_option"
                  value="none"
                  defaultChecked
                />{" "}
                Sin pago
              </label>
              <label>
                <input type="radio" name="payment_option" value="deposit" />{" "}
                Abono
              </label>
              <label>
                <input type="radio" name="payment_option" value="total" /> Pago
                total
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <input
                name="payment_amount"
                type="number"
                min="0"
                defaultValue="0"
                placeholder="Monto"
                className={field}
              />
              <select name="payment_method" className={field}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="company">Empresa</option>
                <option value="other">Otro</option>
              </select>
              <input
                name="operation_number"
                placeholder="Nº operación (opcional)"
                className={field}
              />
              <input
                name="bank"
                placeholder="Banco (opcional)"
                className={field}
              />
              <input
                name="payment_notes"
                placeholder="Observación"
                className={field}
              />
            </div>
          </fieldset>
          <button className="rounded-xl bg-[#277a55] px-5 py-3 font-semibold text-white md:col-span-2 xl:col-span-3">
            Guardar reserva
          </button>
        </form>
      </Panel>
    </>
  );
}
