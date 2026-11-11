import { Panel } from "@/components/ui/page";
import { IdPhotoField } from "@/components/lodging/id-photo-field";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachReservationDocumentsAction } from "@/modules/lodging/application/guest-document-actions";

/** Documento de identidad de la reserva: fotos cargadas por recepción, con la opción de adjuntarlas o reemplazarlas. */
export async function ReservationDocumentsPanel({
  reservation,
  canManage,
}: {
  reservation: { id: string; status: string; origin: string };
  canManage: boolean;
}) {
  if (reservation.origin === "maintenance") return null;
  const supabase = await createSupabaseServerClient();
  const { data: docs } = await supabase
    .from("lodging_reservation_documents")
    .select("front_path,back_path,updated_at")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  const closed = ["cancelled", "conflict"].includes(reservation.status);
  const photos = [
    docs?.front_path ? { label: "Frente", side: "front" } : null,
    docs?.back_path ? { label: "Reverso", side: "back" } : null,
  ].filter((p): p is { label: string; side: string } => !!p);
  if (closed && photos.length === 0) return null;

  return (
    <div id="documento-identidad" className="min-w-0 scroll-mt-4">
      <Panel>
        <h2 className="font-semibold">Documento de identidad</h2>
        <p className="mt-1 text-sm text-slate-500">
          Foto del carnet o pasaporte del huésped. Solo la ve el personal con acceso a las reservas de este hostal.
        </p>
        {photos.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {photos.map((p) => {
              const url = `/api/lodging/reservations/${reservation.id}/document/${p.side}?from=staff`;
              return (
                <a key={p.side} href={url} target="_blank" rel="noopener" className="block text-center text-xs text-slate-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Documento: ${p.label}`} className="h-24 w-40 rounded-lg border object-cover" />
                  {p.label}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Aún no hay foto del documento.</p>
        )}
        {canManage && !closed && (
          <form action={attachReservationDocumentsAction} className="mt-4 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <IdPhotoField name="document_front" label="Foto del frente" />
            <IdPhotoField name="document_back" label="Foto del reverso" />
            <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white md:col-span-2 md:justify-self-start">
              {photos.length ? "Reemplazar foto(s)" : "Guardar documento"}
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
}
