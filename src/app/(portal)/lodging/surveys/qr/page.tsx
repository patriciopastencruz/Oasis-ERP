import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext } from "@/modules/lodging/application/queries";
import {
  surveyBaseUrl,
  surveyUrl,
} from "@/modules/lodging/application/survey-links";

export const dynamic = "force-dynamic";

export default async function SurveyQrPage() {
  const { unit, supabase } = await lodgingContext("lodging.surveys.view");
  const base = surveyBaseUrl(await headers());
  const { data: rooms } = await supabase
    .from("lodging_rooms")
    .select("id,name,survey_token")
    .eq("business_unit_id", unit.id)
    .eq("active", true)
    .order("display_order");

  const items = await Promise.all(
    (rooms ?? []).map(async (room) => {
      const url = surveyUrl(base, room.survey_token);
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      });
      return { ...room, url, svg };
    }),
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Códigos QR de la encuesta"
          description="Un QR por habitación: el huésped lo escanea y responde desde su celular."
        />
        <div className="flex gap-2">
          <Link
            href="/lodging/surveys"
            className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Ver resultados
          </Link>
          <a
            href="/api/lodging/surveys/qr-sheet"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Printer size={16} /> Hoja para imprimir
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Panel key={item.id} className="text-center">
            <b className="block">{item.name}</b>
            <div
              className="mx-auto my-3 size-44 [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: item.svg }}
            />
            <input
              readOnly
              value={item.url}
              className="w-full rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]"
            />
            <div className="mt-2 flex justify-center gap-3 text-xs font-semibold text-[#0b4f9c]">
              <a href={item.url} target="_blank" rel="noreferrer">
                Probar encuesta
              </a>
              <a
                download={`qr-${item.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`}
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`}
              >
                Descargar SVG
              </a>
            </div>
          </Panel>
        ))}
      </div>
      {!items.length && (
        <Panel className="text-center text-sm text-slate-500">
          Esta unidad no tiene habitaciones activas.
        </Panel>
      )}
    </>
  );
}
