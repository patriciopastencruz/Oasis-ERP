import { headers } from "next/headers";
import { Panel } from "@/components/ui/page";
import { CheckinLinkShare } from "@/components/lodging/checkin-link-share";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { surveyBaseUrl, surveyUrl } from "@/modules/lodging/application/survey-links";
import { whatsappNumber } from "@/modules/lodging/domain/checkin";
import { surveyMessage } from "@/modules/lodging/domain/survey";

/** Encuesta de satisfacción en la ficha de la reserva: el link de la habitación del huésped, listo para enviar. */
export async function SurveySharePanel({
  reservation,
  unitName,
  guest,
}: {
  reservation: { status: string; origin: string; room_id: string };
  unitName: string;
  guest: { full_name: string | null; phone: string | null } | null;
}) {
  if (["cancelled", "conflict"].includes(reservation.status) || reservation.origin === "maintenance") return null;
  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase
    .from("lodging_rooms")
    .select("survey_token")
    .eq("id", reservation.room_id)
    .maybeSingle();
  if (!room?.survey_token) return null;
  const url = surveyUrl(surveyBaseUrl(await headers()), room.survey_token);
  return (
    <Panel className="mt-4">
      <h2 className="font-semibold">Encuesta de satisfacción</h2>
      <p className="mt-1 mb-3 text-sm text-slate-500">
        Envíale al huésped el link de la encuesta de su habitación, idealmente al terminar la estadía.
      </p>
      <CheckinLinkShare
        url={url}
        phone={whatsappNumber(guest?.phone)}
        message={surveyMessage(unitName, url, guest?.full_name)}
      />
    </Panel>
  );
}
