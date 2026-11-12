import { Panel } from "@/components/ui/page";
import { IdPhotoField } from "@/components/lodging/id-photo-field";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveReservationGuestAction } from "@/modules/lodging/application/guest-document-actions";

type Guest = { full_name: string | null; phone: string | null; email: string | null; document: string | null; nationality: string | null };

/**
 * Datos de la persona y foto del frente de su documento, editables en cualquier reserva vigente. En las importadas
 * (Booking/Airbnb) los datos se completan en «Completar información interna», así que aquí solo va la foto.
 */
export async function ReservationGuestPanel({
  reservation,
  guest,
  canManage,
}: {
  reservation: { id: string; status: string; origin: string; imported_from_ical: boolean };
  guest: Guest | null;
  canManage: boolean;
}) {
  if (reservation.origin === "maintenance") return null;
  const supabase = await createSupabaseServerClient();
  const { data: docs } = await supabase
    .from("lodging_reservation_documents")
    .select("front_path")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  const closed = ["cancelled", "conflict"].includes(reservation.status);
  const hasPhoto = !!docs?.front_path;
  const showGuestFields = !reservation.imported_from_ical;
  if (closed && !hasPhoto) return null;
  const field = "mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0b4f9c]";
  const photoUrl = `/api/lodging/reservations/${reservation.id}/document/front?from=staff`;

  return (
    <div id="datos-huesped" className="min-w-0 scroll-mt-4">
      <Panel>
        <h2 className="font-semibold">Datos del huésped y documento de identidad</h2>
        <p className="mt-1 text-sm text-slate-500">
          La foto del documento solo la ve el personal con acceso a las reservas de este hostal.
        </p>
        {hasPhoto && (
          <a href={photoUrl} target="_blank" rel="noopener" className="mt-3 inline-block text-center text-xs text-slate-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Documento de identidad" className="h-24 w-40 rounded-lg border object-cover" />
            Documento
          </a>
        )}
        {canManage && !closed && (
          <form action={saveReservationGuestAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input type="hidden" name="reservation_id" value={reservation.id} />
            {showGuestFields && (
              <>
                <input type="hidden" name="with_guest" value="1" />
                <label className="text-sm font-medium">
                  Nombre del huésped
                  <input name="full_name" required minLength={3} maxLength={160} defaultValue={guest?.full_name ?? ""} className={field} />
                </label>
                <label className="text-sm font-medium">
                  Teléfono
                  <input name="phone" required minLength={6} maxLength={50} defaultValue={guest?.phone ?? ""} className={field} />
                </label>
                <label className="text-sm font-medium">
                  Correo
                  <input name="email" type="email" maxLength={160} defaultValue={guest?.email ?? ""} className={field} />
                </label>
                <label className="text-sm font-medium">
                  Documento (RUT o pasaporte)
                  <input name="document" maxLength={80} defaultValue={guest?.document ?? ""} className={field} />
                </label>
                <label className="text-sm font-medium">
                  Nacionalidad
                  <input name="nationality" maxLength={80} defaultValue={guest?.nationality ?? ""} className={field} />
                </label>
              </>
            )}
            <div className="md:col-span-2 xl:col-span-1">
              <IdPhotoField name="document_front" label={hasPhoto ? "Reemplazar foto del frente" : "Foto del frente del documento"} />
            </div>
            <button className="rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2 md:justify-self-start xl:col-span-3">
              {showGuestFields ? "Guardar datos" : "Guardar documento"}
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
}
