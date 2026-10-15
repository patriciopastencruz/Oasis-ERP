import type { KgDay } from "@/modules/finance/distribution/domain/closing-report";

const kgFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const clpFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dayLabel = (date: string) => String(Number(date.slice(8)));

/** Kilos de hielo vendidos por día: barras apiladas de hielo cubo y frappé. */
export function KgPerDayChart({ days }: { days: KgDay[] }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  const width = Math.max(days.length * 34, 320);
  const height = 190;
  const top = 18;
  const bottom = 24;
  const plot = height - top - bottom;
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Kilos de hielo vendidos por día"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="min-w-full"
      >
        <line x1="0" x2={width} y1={top + plot} y2={top + plot} stroke="#d9dfe6" />
        {days.map((d, i) => {
          const x = i * 34 + 6;
          const cubeH = (d.cube / max) * plot;
          const frappeH = (d.frappe / max) * plot;
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${kgFormat.format(d.total)} kg (cubo ${kgFormat.format(d.cube)}, frappé ${kgFormat.format(d.frappe)})`}</title>
              <rect x={x} y={top + plot - cubeH} width="22" height={cubeH} fill="#0b4f9c" />
              <rect x={x} y={top + plot - cubeH - frappeH} width="22" height={frappeH} fill="#7fb2e5" />
              {d.total > 0 && (
                <text x={x + 11} y={top + plot - cubeH - frappeH - 4} textAnchor="middle" fontSize="9" fill="#083f7d" fontWeight="600">
                  {kgFormat.format(d.total)}
                </text>
              )}
              <text x={x + 11} y={height - 8} textAnchor="middle" fontSize="9" fill="#63778e">
                {dayLabel(d.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-[#56677b]">
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-[#0b4f9c]" /> Hielo cubo</span>
        <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm bg-[#7fb2e5]" /> Hielo frappé</span>
      </div>
    </div>
  );
}

/** Ingreso acumulado del mes, día a día. */
export function CumulativeIncomeChart({ days }: { days: { date: string; daily: number; cumulative: number }[] }) {
  const max = Math.max(...days.map((d) => d.cumulative), 1);
  const width = Math.max(days.length * 34, 320);
  const height = 190;
  const top = 22;
  const bottom = 24;
  const plot = height - top - bottom;
  const point = (d: (typeof days)[number], i: number) => ({
    x: i * 34 + 17,
    y: top + plot - (d.cumulative / max) * plot,
  });
  const points = days.map(point);
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = days.at(-1);
  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Ingreso acumulado del mes"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="min-w-full"
      >
        <line x1="0" x2={width} y1={top + plot} y2={top + plot} stroke="#d9dfe6" />
        {points.length > 0 && (
          <polygon
            points={`${points[0].x},${top + plot} ${line} ${points.at(-1)!.x},${top + plot}`}
            fill="#0b4f9c"
            fillOpacity="0.1"
          />
        )}
        <polyline points={line} fill="none" stroke="#0b4f9c" strokeWidth="2" />
        {days.map((d, i) => (
          <g key={d.date}>
            <title>{`${d.date}: ${clpFormat.format(d.cumulative)} acumulado (${clpFormat.format(d.daily)} del día)`}</title>
            <circle cx={points[i].x} cy={points[i].y} r="2.5" fill="#0b4f9c" />
            <text x={points[i].x} y={height - 8} textAnchor="middle" fontSize="9" fill="#63778e">
              {dayLabel(d.date)}
            </text>
          </g>
        ))}
        {last && points.length > 0 && (
          <text x={Math.min(points.at(-1)!.x, width - 4)} y={Math.max(points.at(-1)!.y - 8, 10)} textAnchor="end" fontSize="10" fill="#083f7d" fontWeight="700">
            {clpFormat.format(last.cumulative)}
          </text>
        )}
      </svg>
    </div>
  );
}
