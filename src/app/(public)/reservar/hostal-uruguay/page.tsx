import {
  publicLodgingRooms,
  submitPublicLodgingRequestAction,
} from "@/modules/lodging/application/public-actions";
import { clp } from "@/modules/lodging/application/queries";

export const metadata = {
  title: "Reservar | Hostal Oasis Atacama",
  description:
    "Reserva tu habitación en Hostal Oasis Atacama, Calama. Elige fechas, transfiere y sube tu comprobante.",
};

// La disponibilidad y el listado de habitaciones deben leerse en vivo en
// cada visita: sin esto, la Data Cache de Next.js puede congelar la
// respuesta de publicLodgingRooms() (supabase-js usa fetch por debajo) y
// servir un resultado desactualizado aunque la ruta sea dinámica.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const BANK_ACCOUNT = {
  bank: "Banco de Chile",
  accountType: "Cuenta FAN Emprende",
  accountNumber: "155425344",
  rut: "78.271.136-9",
  holder: "OASIS Atacama SpA",
  email: "oasismodulares@gmail.com",
};

const field =
  "mt-1 block w-full rounded-xl border border-[#e4d9c8] bg-white px-3.5 py-2.5 text-sm text-[#241c16] outline-none focus:border-[#c1652f]";
const label = "text-sm font-medium text-[#3a2f26]";

export default async function ReservarHostalUruguayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { unit, rooms } = await publicLodgingRooms();

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c1652f]">
        Hostal Oasis Atacama
      </p>
      <h1
        className="mt-2 text-3xl font-bold text-[#241c16]"
        style={{ fontFamily: "var(--font-playfair), serif" }}
      >
        Reserva tu estadía
      </h1>
      <p className="mt-2 text-sm text-[#6b5d4f]">
        Elige tu habitación y fechas, transfiere el total y sube tu
        comprobante. Confirmamos tu solicitud en las próximas horas.
      </p>

      {q.success && (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          {q.success}
        </div>
      )}

      {!q.success && q.error && (
        <p className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}

      {!q.success && !unit && (
        <p className="mt-8 rounded-xl border border-[#e4d9c8] bg-white p-6 text-sm text-[#6b5d4f]">
          Las reservas online no están disponibles en este momento. Escríbenos
          directamente por WhatsApp.
        </p>
      )}

      {!q.success && unit && (
        <form
          action={submitPublicLodgingRequestAction}
          className="mt-8 space-y-6"
        >
          <div className="rounded-2xl border border-[#e4d9c8] bg-white p-5">
            <h2 className="font-semibold text-[#241c16]">1. Habitación y fechas</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={`${label} sm:col-span-2`}>
                Habitación
                <select name="room_id" required defaultValue="" className={field}>
                  <option value="" disabled>
                    Elige una habitación
                  </option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {clp.format(Number(r.base_rate))} / noche ·{" "}
                      {r.capacity} {r.capacity === 1 ? "persona" : "personas"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Entrada
                <input name="check_in" type="date" required className={field} />
              </label>
              <label className={label}>
                Salida
                <input name="check_out" type="date" required className={field} />
              </label>
              <label className={label}>
                Personas
                <input
                  name="guest_count"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={1}
                  required
                  className={field}
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d9c8] bg-white p-5">
            <h2 className="font-semibold text-[#241c16]">2. Tus datos</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={`${label} sm:col-span-2`}>
                Nombre completo
                <input name="guest_name" required className={field} />
              </label>
              <label className={label}>
                Teléfono (WhatsApp)
                <input name="phone" required className={field} />
              </label>
              <label className={label}>
                Correo (opcional)
                <input name="email" type="email" className={field} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d9c8] bg-white p-5">
            <h2 className="font-semibold text-[#241c16]">
              3. Transferencia y comprobante
            </h2>
            <p className="mt-2 text-sm text-[#6b5d4f]">
              Transfiere el total de tu estadía a esta cuenta y adjunta el
              comprobante. Revisamos tu pago y confirmamos la reserva.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-[#faf6ef] p-4 text-sm">
              <dt className="text-[#6b5d4f]">Banco</dt>
              <dd className="font-medium text-[#241c16]">{BANK_ACCOUNT.bank}</dd>
              <dt className="text-[#6b5d4f]">Tipo de cuenta</dt>
              <dd className="font-medium text-[#241c16]">
                {BANK_ACCOUNT.accountType}
              </dd>
              <dt className="text-[#6b5d4f]">Número</dt>
              <dd className="font-medium text-[#241c16]">
                {BANK_ACCOUNT.accountNumber}
              </dd>
              <dt className="text-[#6b5d4f]">RUT</dt>
              <dd className="font-medium text-[#241c16]">{BANK_ACCOUNT.rut}</dd>
              <dt className="text-[#6b5d4f]">Titular</dt>
              <dd className="font-medium text-[#241c16]">{BANK_ACCOUNT.holder}</dd>
              <dt className="text-[#6b5d4f]">Email confirmación</dt>
              <dd className="font-medium text-[#241c16]">{BANK_ACCOUNT.email}</dd>
            </dl>
            <label className={`${label} mt-4 block`}>
              Comprobante de transferencia
              <input
                name="receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                required
                className="mt-1 block w-full text-sm text-[#3a2f26]"
              />
              <span className="mt-1 block text-xs text-[#6b5d4f]">
                PDF, JPG, PNG o WEBP, hasta 10 MB.
              </span>
            </label>
          </div>

          {/* Honeypot anti-bots: invisible para personas, un bot lo completa. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            <label>
              No completar este campo
              <input name="website" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-[#c1652f] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#a4531f]"
          >
            Enviar solicitud de reserva
          </button>
          <p className="text-center text-xs text-[#6b5d4f]">
            Al enviar, aceptas que revisemos tu comprobante antes de confirmar
            la reserva. La fecha queda retenida mientras la revisamos.
          </p>
        </form>
      )}
    </main>
  );
}
