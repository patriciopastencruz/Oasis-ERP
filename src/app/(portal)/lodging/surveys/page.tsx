import Link from "next/link";
import { QrCode } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import {
  formatDate,
  lodgingContext,
} from "@/modules/lodging/application/queries";
import {
  parseHistoryMonth,
  shiftMonth,
} from "@/modules/lodging/domain/history-report";
import {
  summarizeSurveys,
  surveyAverage,
  type SurveyRow,
} from "@/modules/lodging/domain/survey";

export const dynamic = "force-dynamic";

function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-15T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const scoreColor = (value: number) =>
  value >= 4.5
    ? "bg-emerald-500"
    : value >= 3.5
      ? "bg-lime-500"
      : value >= 2.5
        ? "bg-amber-500"
        : "bg-red-500";

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; room?: string }>;
}) {
  const q = await searchParams;
  const { unit, supabase } = await lodgingContext("lodging.surveys.view");
  const month = parseHistoryMonth(q.month);
  // Límites aproximados en hora de Chile (UTC-4); basta para estadísticas.
  const from = `${month}-01T04:00:00Z`;
  const to = `${shiftMonth(month, 1)}-01T04:00:00Z`;

  const [{ data: rooms }, { data }] = await Promise.all([
    supabase
      .from("lodging_rooms")
      .select("id,name")
      .eq("business_unit_id", unit.id)
      .order("display_order"),
    (() => {
      let query = supabase
        .from("lodging_satisfaction_surveys")
        .select(
          "id,created_at,cleanliness,comfort,staff,value_for_money,recommend,comment,guest_name,contact,room_id,lodging_rooms(name)",
        )
        .eq("business_unit_id", unit.id)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .limit(500);
      if (q.room) query = query.eq("room_id", q.room);
      return query;
    })(),
  ]);

  const surveys = (data ?? []).map((row) => ({
    ...row,
    room: Array.isArray(row.lodging_rooms)
      ? row.lodging_rooms[0]
      : row.lodging_rooms,
  }));
  const rows = surveys as unknown as SurveyRow[];
  const summary = summarizeSurveys(rows);

  const byRoom = new Map<string, { name: string; rows: SurveyRow[] }>();
  for (const s of surveys) {
    const entry = byRoom.get(s.room_id) ?? {
      name: s.room?.name ?? "—",
      rows: [] as SurveyRow[],
    };
    entry.rows.push(s as unknown as SurveyRow);
    byRoom.set(s.room_id, entry);
  }
  const roomStats = [...byRoom.values()]
    .map((r) => ({
      name: r.name,
      count: r.rows.length,
      average: summarizeSurveys(r.rows).overall ?? 0,
    }))
    .sort((a, b) => a.average - b.average);

  const href = (m: string) =>
    `/lodging/surveys?month=${m}${q.room ? `&room=${q.room}` : ""}`;
  const comments = surveys.filter((s) => s.comment);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Encuestas de satisfacción"
          description="Qué opinan los huéspedes y en qué podemos mejorar."
        />
        <Link
          href="/lodging/surveys/qr"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white"
        >
          <QrCode size={16} /> Códigos QR por habitación
        </Link>
      </div>

      <div className="mb-5 mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={href(shiftMonth(month, -1))}
          className="rounded-lg border bg-white px-3 py-1.5"
        >
          ←
        </Link>
        <span className="min-w-36 text-center font-semibold">
          {monthLabel(month)}
        </span>
        <Link
          href={href(shiftMonth(month, 1))}
          className="rounded-lg border bg-white px-3 py-1.5"
        >
          →
        </Link>
        <form className="ml-auto flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select
            name="room"
            defaultValue={q.room ?? ""}
            className="rounded-lg border bg-white px-2 py-1.5"
          >
            <option value="">Todas las habitaciones</option>
            {(rooms ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-[#0b4f9c] px-3 py-1.5 font-semibold text-white">
            Filtrar
          </button>
        </form>
      </div>

      {!summary.count ? (
        <Panel className="text-center text-sm text-slate-600">
          Aún no hay respuestas en este período. Imprime los{" "}
          <Link href="/lodging/surveys/qr" className="font-semibold text-[#0b4f9c]">
            códigos QR
          </Link>{" "}
          y pégalos en cada habitación.
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Respuestas", String(summary.count)],
              ["Puntaje general", `${summary.overall} / 5`],
              [
                "NPS (recomendación)",
                `${summary.nps! > 0 ? "+" : ""}${summary.nps}`,
              ],
              [
                "Recomiendan (9-10)",
                `${Math.round((summary.promoters / summary.count) * 100)}%`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-[#d9dfe6] bg-white p-4"
              >
                <b className="block text-2xl leading-none text-slate-800">
                  {value}
                </b>
                <span className="mt-1.5 block text-xs text-slate-500">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <h2 className="font-semibold">Puntaje por área</h2>
              <p className="mt-1 text-xs text-slate-500">
                De menor a mayor: arriba están las áreas con más espacio de
                mejora.
              </p>
              <div className="mt-4 space-y-4">
                {[...summary.categories]
                  .sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
                  .map((c) => (
                    <div key={c.key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {c.label}
                          {summary.weakest?.key === c.key && (
                            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              Prioridad de mejora
                            </span>
                          )}
                        </span>
                        <b>{c.average} / 5</b>
                      </div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-slate-100">
                        <div
                          className={`h-2.5 rounded-full ${scoreColor(c.average ?? 0)}`}
                          style={{ width: `${((c.average ?? 0) / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="font-semibold">Puntaje por habitación</h2>
              <p className="mt-1 text-xs text-slate-500">
                Ordenadas de peor a mejor promedio.
              </p>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1.5">Habitación</th>
                    <th className="text-right">Respuestas</th>
                    <th className="text-right">Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {roomStats.map((r) => (
                    <tr key={r.name}>
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="text-right text-slate-500">{r.count}</td>
                      <td className="text-right font-bold">{r.average} / 5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel className="mt-5">
            <h2 className="font-semibold">
              Comentarios ({comments.length})
            </h2>
            <div className="mt-3 divide-y">
              {comments.length ? (
                comments.map((s) => (
                  <div key={s.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <b className="text-slate-700">{s.room?.name ?? "—"}</b>
                      <span>{formatDate(s.created_at)}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {surveyAverage(s as unknown as SurveyRow)} / 5
                      </span>
                      <span>Recomendaría: {s.recommend}/10</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-slate-800">
                      {s.comment}
                    </p>
                    {(s.guest_name || s.contact) && (
                      <p className="mt-1 text-xs text-slate-500">
                        Contacto: {[s.guest_name, s.contact].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Nadie dejó comentarios en este período.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
