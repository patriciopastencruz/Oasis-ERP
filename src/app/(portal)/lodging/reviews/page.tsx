import { ReviewScoreForm } from "@/components/lodging/review-score-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingUnitCodes } from "@/config/business-units";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { saveReviewScoreAction } from "@/modules/lodging/application/review-actions";
import { santiagoToday } from "@/modules/lodging/domain/daily-closing";
import {
  REVIEW_CATEGORIES,
  summarizeReviewHistory,
  type ReviewScoreRow,
} from "@/modules/lodging/domain/review-scores";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = (iso: string) => iso.split("-").reverse().join("-");

function Delta({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  if (value == null || value === 0)
    return <span className="text-xs text-slate-400">{value === 0 ? "=" : ""}</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(value).toLocaleString("es-CL", { maximumFractionDigits: digits })}
    </span>
  );
}

function Chart({ rows }: { rows: ReviewScoreRow[] }) {
  const sorted = [...rows].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on)).slice(-30);
  if (sorted.length < 2)
    return <p className="text-xs text-slate-500">La evolución aparece desde el segundo registro.</p>;
  const values = sorted.map((r) => r.score);
  const min = Math.max(0, Math.floor(Math.min(...values) - 0.5));
  const max = Math.min(10, Math.ceil(Math.max(...values) + 0.5));
  const w = 300, h = 80, pad = 6;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (sorted.length - 1);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  const points = sorted.map((r, i) => `${x(i)},${y(r.score)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label="Evolución del puntaje">
      <polyline points={points} fill="none" stroke="#2a78d6" strokeWidth="2" />
      {sorted.map((r, i) => (
        <circle key={r.recorded_on} cx={x(i)} cy={y(r.score)} r="3" fill="#2a78d6">
          <title>{`${fmtDate(r.recorded_on)}: ${fmt(r.score)}`}</title>
        </circle>
      ))}
      <text x="2" y="10" fontSize="9" fill="#8a96a3">{max}</text>
      <text x="2" y={h - 2} fontSize="9" fill="#8a96a3">{min}</text>
    </svg>
  );
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const q = await searchParams;
  const ctx = await requirePermission("lodging.reviews.view");
  const units = ctx.units.filter((u) => lodgingUnitCodes.includes(u.code));
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("lodging_review_scores")
    .select("business_unit_id,recorded_on,score,review_count,categories,listing_name")
    .eq("source", "booking")
    .in("business_unit_id", units.map((u) => u.id))
    .order("recorded_on", { ascending: false })
    .limit(500);

  const byUnit = new Map<string, (ReviewScoreRow & { listing_name: string | null })[]>();
  for (const r of data ?? []) {
    const list = byUnit.get(r.business_unit_id) ?? [];
    list.push({
      recorded_on: r.recorded_on,
      score: Number(r.score),
      review_count: Number(r.review_count),
      categories: (r.categories ?? {}) as ReviewScoreRow["categories"],
      listing_name: r.listing_name,
    });
    byUnit.set(r.business_unit_id, list);
  }

  return (
    <>
      <PageHeader
        eyebrow="Hospedaje"
        title="Reputación en Booking"
        description="Puntaje de reseñas de cada hostal y cómo evoluciona en el tiempo."
      />
      {(q.success || q.error) && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {q.error || q.success}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        {units.map((unit) => {
          const rows = byUnit.get(unit.id) ?? [];
          const s = summarizeReviewHistory(rows);
          return (
            <Panel key={unit.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{unit.name}</p>
              {!s.latest ? (
                <p className="mt-3 text-sm text-slate-500">Sin registros todavía.</p>
              ) : (
                <>
                  <div className="mt-1 flex items-end gap-3">
                    <b className="text-4xl leading-none">{fmt(s.latest.score)}</b>
                    <Delta value={s.scoreDelta} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {s.latest.review_count} comentarios <Delta value={s.countDelta} digits={0} /> ·{" "}
                    {rows[0]?.listing_name ?? "Booking"} · al {fmtDate(s.latest.recorded_on)}
                  </p>
                  <div className="mt-3"><Chart rows={rows} /></div>
                  <div className="mt-3 space-y-2">
                    {REVIEW_CATEGORIES.filter(({ key }) => s.latest!.categories[key] != null).map(({ key, label }) => {
                      const v = s.latest!.categories[key]!;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-xs">
                            <span>
                              {label}
                              {s.weakest?.key === key && (
                                <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">más baja</span>
                              )}
                            </span>
                            <span className="font-semibold">{fmt(v)} <Delta value={s.categoryDeltas[key]} /></span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${v * 10}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Panel>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel>
          <h2 className="font-semibold">Historial</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-1.5">Fecha</th><th>Hostal</th><th className="text-right">Puntaje</th><th className="text-right">Comentarios</th></tr>
              </thead>
              <tbody className="divide-y">
                {(data ?? []).slice(0, 40).map((r) => (
                  <tr key={`${r.business_unit_id}-${r.recorded_on}`}>
                    <td className="py-1.5">{fmtDate(r.recorded_on)}</td>
                    <td>{units.find((u) => u.id === r.business_unit_id)?.name ?? "—"}</td>
                    <td className="text-right font-semibold">{fmt(Number(r.score))}</td>
                    <td className="text-right text-slate-500">{r.review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h2 className="font-semibold">Registrar puntaje</h2>
          <p className="mt-1 text-xs text-slate-500">Pega el texto de la ficha de Booking o escribe los valores. Si ya hay un registro ese día, se reemplaza.</p>
          <ReviewScoreForm
            units={units.map((u) => ({ id: u.id, name: u.name }))}
            today={santiagoToday()}
            action={saveReviewScoreAction}
          />
        </Panel>
      </div>
    </>
  );
}
