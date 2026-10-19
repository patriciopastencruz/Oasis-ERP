import { headers } from "next/headers";
import { Panel } from "@/components/ui/page";
import { ConfirmButton } from "@/components/sales/confirm-button";
import { CheckinLinkShare } from "@/components/lodging/checkin-link-share";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCheckinLinkAction, revokeCheckinLinkAction } from "@/modules/lodging/application/checkin-actions";
import { surveyBaseUrl } from "@/modules/lodging/application/survey-links";
import { checkinMessage, checkinUrl, whatsappNumber, type CheckinData } from "@/modules/lodging/domain/checkin";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

/** Check-in online en la ficha de la reserva: crear el link, enviarlo y ver lo que llenó el huésped. */
export async function CheckinOnlinePanel({
  reservation,
  unitName,
  guest,
  canManage,
}: {
  reservation: { id: string; status: string; check_in: string; origin: string };
  unitName: string;
  guest: { full_name: string | null; phone: string | null } | null;
  canManage: boolean;
}) {
  if (["cancelled", "conflict", "checked_out"].includes(reservation.status) || reservation.origin === "maintenance") return null;
  const supabase = await createSupabaseServerClient();
  const { data: link } = await supabase
    .from("lodging_checkin_links")
    .select("token,expires_at,submitted_at,submission,created_at,document_front_path,document_back_path")
    .eq("reservation_id", reservation.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const url = link ? checkinUrl(surveyBaseUrl(await headers()), link.token) : null;
  const sub = (link?.submission ?? null) as CheckinData | null;
  // Fotos del documento en bucket privado: URLs firmadas de 10 minutos (la política exige acceso al hostal).
  const photoPaths = [link?.document_front_path, link?.document_back_path].filter((p): p is string => !!p);
  const { data: signed } = photoPaths.length
    ? await supabase.storage.from("lodging-guest-documents").createSignedUrls(photoPaths, 600)
    : { data: [] as { signedUrl: string | null }[] };
  const photos = (signed ?? []).map((s, i) => ({
    url: s.signedUrl,
    label: photoPaths[i] === link?.document_front_path ? "Frente" : "Reverso",
  }));

  return (
    <div id="checkin-online" className="scroll-mt-4">
    <Panel className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Check-in online</h2>
          <p className="mt-1 text-sm text-slate-500">
            El huésped completa sus datos desde el celular antes de llegar. El link vence al día siguiente del check-out.
          </p>
        </div>
        {link && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${link.submitted_at ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          >
            {link.submitted_at ? `Completado ${when(link.submitted_at)}` : "Esperando al huésped"}
          </span>
        )}
      </div>

      {!link ? (
        canManage && (
          <form action={createCheckinLinkAction} className="mt-3">
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <button className="rounded-xl bg-[#0b4f9c] px-4 py-2 text-sm font-semibold text-white">Crear link de check-in</button>
          </form>
        )
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {url && (
              <CheckinLinkShare
                url={url}
                phone={whatsappNumber(sub?.phone ?? guest?.phone)}
                message={checkinMessage(unitName, reservation.check_in, url, sub?.full_name ?? guest?.full_name)}
              />
            )}
            {canManage && (
              <div className="flex flex-wrap gap-3 text-sm">
                <form action={createCheckinLinkAction}>
                  <input type="hidden" name="reservation_id" value={reservation.id} />
                  <ConfirmButton
                    message="¿Generar un link nuevo? El link anterior dejará de funcionar."
                    className="font-semibold text-slate-600"
                  >
                    Generar link nuevo
                  </ConfirmButton>
                </form>
                <form action={revokeCheckinLinkAction}>
                  <input type="hidden" name="reservation_id" value={reservation.id} />
                  <ConfirmButton message="¿Desactivar el link de check-in?" className="font-semibold text-red-700">
                    Desactivar link
                  </ConfirmButton>
                </form>
              </div>
            )}
          </div>
          {sub && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Titular</dt>
              <dd className="font-semibold">{sub.full_name}</dd>
              <dt className="text-slate-500">Documento</dt>
              <dd>{sub.document}</dd>
              <dt className="text-slate-500">Nacionalidad</dt>
              <dd>{sub.nationality}</dd>
              <dt className="text-slate-500">Contacto</dt>
              <dd>
                {sub.phone}
                {sub.email ? ` · ${sub.email}` : ""}
              </dd>
              {sub.estimated_arrival && (
                <>
                  <dt className="text-slate-500">Llegada aprox.</dt>
                  <dd>{sub.estimated_arrival}</dd>
                </>
              )}
              {sub.license_plate && (
                <>
                  <dt className="text-slate-500">Patente</dt>
                  <dd>{sub.license_plate}</dd>
                </>
              )}
              {!!sub.companions?.length && (
                <>
                  <dt className="text-slate-500">Acompañantes</dt>
                  <dd>
                    {sub.companions.map((c) => (
                      <span key={c.full_name} className="block">
                        {c.full_name}
                        {c.document ? ` · ${c.document}` : ""}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {sub.notes && (
                <>
                  <dt className="text-slate-500">Comentarios</dt>
                  <dd>{sub.notes}</dd>
                </>
              )}
              {photos.length > 0 && (
                <>
                  <dt className="text-slate-500">Documento</dt>
                  <dd className="flex flex-wrap gap-2">
                    {photos.map((p) =>
                      p.url ? (
                        <a key={p.label} href={p.url} target="_blank" rel="noopener" className="block text-center text-xs text-slate-500">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={`Documento: ${p.label}`} className="h-20 w-32 rounded-lg border object-cover" />
                          {p.label}
                        </a>
                      ) : null,
                    )}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
    </Panel>
    </div>
  );
}
