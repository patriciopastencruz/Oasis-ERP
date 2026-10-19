import { Panel } from "@/components/ui/page";
import { ArrivalContactButton } from "@/components/lodging/arrival-contact-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Bienvenida por WhatsApp en la ficha de la reserva: el mismo mensaje de Llegadas/Salidas, para cualquier fecha. */
export async function ArrivalContactPanel({
  reservation,
  canManage,
}: {
  reservation: { id: string; status: string; origin: string };
  canManage: boolean;
}) {
  if (!canManage || ["cancelled", "conflict", "checked_out"].includes(reservation.status) || reservation.origin === "maintenance") return null;
  const supabase = await createSupabaseServerClient();
  const { data: contact } = await supabase
    .from("lodging_arrival_contacts")
    .select("contacted_at")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  const sentAt = contact?.contacted_at
    ? new Date(contact.contacted_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })
    : null;
  return (
    <div className="min-w-0">
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bienvenida al huésped</h2>
          <p className="mt-1 text-sm text-slate-500">
            Abre WhatsApp con el mensaje listo: horarios, desayuno (solo Cobija), link de check-in online y la información de llegada del hostal.
          </p>
          {reservation.origin === "booking" || reservation.origin === "airbnb" ? (
            <p className="mt-1 text-xs text-amber-700">
              Reserva de {reservation.origin === "booking" ? "Booking" : "Airbnb"}: confirma que el teléfono sea del huésped.
            </p>
          ) : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sentAt ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          {sentAt ? `Enviada ${sentAt}` : "Sin enviar"}
        </span>
      </div>
      <div className="mt-3">
        <ArrivalContactButton reservationId={reservation.id} contacted={!!sentAt} />
      </div>
    </Panel>
    </div>
  );
}
