import { clp } from "./daily-closing";

/**
 * Bono mensual de recepción por cumplimiento de metas (un monto fijo por hostal).
 * Ocupación, venta promedio, Booking y encuesta reparten puntos según su peso:
 * cumple la meta = todo su peso, entre el 90% y el 99% de la meta = la mitad,
 * menos = nada. Aseo (inspecciones) y orden administrativo son de cumple o no
 * cumple, sin término medio. Si un indicador no se puede evaluar (sin meta o sin
 * datos suficientes) se deja fuera y su peso se reparte entre los demás, para no
 * premiar ni castigar por falta de información.
 */

export const BONUS_INDICATORS = [
  { key: "occupancy", label: "Ocupación del mes" },
  { key: "adr", label: "Venta promedio por habitación" },
  { key: "booking", label: "Puntaje de Booking" },
  { key: "survey", label: "Satisfacción de huéspedes (QR)" },
  { key: "inspections", label: "Aseo: inspección completa y a tiempo" },
  { key: "order", label: "Orden administrativo" },
] as const;

export type BonusKey = (typeof BONUS_INDICATORS)[number]["key"];
export type BonusWeights = Record<BonusKey, number>;

export const DEFAULT_BONUS_WEIGHTS: BonusWeights = {
  occupancy: 25,
  adr: 25,
  booking: 20,
  survey: 10,
  inspections: 5,
  order: 15,
};

/** Cada día cuenta como máximo 110% de ocupación: una reventa no infla el premio. */
export const OCCUPANCY_DAY_CAP = 1.1;
/** Tiempo máximo, en minutos, entre terminar el aseo y la inspección (promedio del mes). */
export const DEFAULT_INSPECTION_MAX_WAIT = 60;
/** Si ninguno de los dos criterios de orden se cumple, el bono se reduce a la mitad. */
export const GATE_MULTIPLIER = 0.5;

export type BonusStatus = "met" | "half" | "miss" | "na";

export type BonusInput = {
  pool: number;
  weights: BonusWeights;
  /** % de ocupación del mes (cada día con tope) y meta. */
  occupancy: { value: number | null; goal: number | null };
  adr: { value: number | null; goal: number | null };
  /** Último puntaje del mes y el del mes anterior (para que no haya bajado). */
  booking: { value: number | null; goal: number | null; previous: number | null };
  survey: { value: number | null; goal: number; responses: number; minResponses: number };
  /** Aseos terminados en el mes, cuántos se inspeccionaron y el tiempo promedio hasta la inspección. */
  inspections: { cleanings: number | null; inspected: number; avgWaitMinutes: number | null; maxWaitMinutes: number };
  order: {
    /** Cierres diarios vencidos, cuántos se emitieron a tiempo y cuáles no (días del mes). */
    closings: { due: number; onTime: number; lateDays: number[] } | null;
    /** Estadías ya terminadas con saldo por cobrar (sin contar las de empresa a crédito). */
    balances: { count: number; total: number } | null;
  };
};

export type BonusCriterion = { label: string; ok: boolean; text: string };

export type BonusRow = {
  key: BonusKey;
  label: string;
  weight: number;
  /** Peso con el que cuenta realmente, una vez repartidos los indicadores no evaluados. */
  effectiveWeight: number;
  value: number | null;
  goal: number | null;
  status: BonusStatus;
  factor: number;
  earned: number;
  note: string | null;
  /** Criterios de cumple / no cumple de los indicadores sin término medio. */
  criteria: BonusCriterion[];
};

/** Ocupación del mes (0-100) con cada día limitado a `cap`. */
export function cappedOccupancyPct(days: { occupied: number }[], totalRooms: number, cap = OCCUPANCY_DAY_CAP) {
  if (!days.length || totalRooms <= 0) return null;
  const sum = days.reduce((s, d) => s + Math.min(d.occupied / totalRooms, cap), 0);
  return (sum / days.length) * 100;
}

/** 1 si alcanza la meta, 0,5 si llega al 90% o más de ella, 0 si no. */
export function tierFactor(value: number, goal: number) {
  if (goal <= 0) return 1;
  const ratio = value / goal;
  return ratio + 1e-9 >= 1 ? 1 : ratio + 1e-9 >= 0.9 ? 0.5 : 0;
}

function santiagoOffsetMinutes(at: Date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/**
 * Plazo del cierre de un día: 06:00 (hora de Santiago) del día siguiente, cuando
 * termina el día de trabajo. Un cierre emitido por primera vez después está atrasado.
 */
export function closingDeadline(closingDate: string) {
  const next = new Date(`${closingDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const localSixAm = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 6, 0, 0);
  let instant = new Date(localSixAm - santiagoOffsetMinutes(new Date(localSixAm)) * 60_000);
  instant = new Date(localSixAm - santiagoOffsetMinutes(instant) * 60_000);
  return instant;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function computeBonus(input: BonusInput) {
  const row = (
    key: BonusKey,
    value: number | null,
    goal: number | null,
    evaluate: () => { factor: number; note?: string; criteria?: BonusCriterion[] } | { na: string },
  ): BonusRow => {
    const label = BONUS_INDICATORS.find((i) => i.key === key)!.label;
    const base = { key, label, weight: input.weights[key], effectiveWeight: 0, value, goal, earned: 0 };
    const out = evaluate();
    if ("na" in out) return { ...base, status: "na", factor: 0, note: out.na, criteria: [] };
    return {
      ...base,
      factor: out.factor,
      status: out.factor === 1 ? "met" : out.factor === 0.5 ? "half" : "miss",
      note: out.note ?? null,
      criteria: out.criteria ?? [],
    };
  };

  const o = input.occupancy;
  const a = input.adr;
  const b = input.booking;
  const s = input.survey;
  const i = input.inspections;
  const ord = input.order;

  const rows: BonusRow[] = [
    row("occupancy", o.value, o.goal, () =>
      o.goal === null ? { na: "Sin meta de ocupación" } : o.value === null ? { na: "Sin datos del mes" } : { factor: tierFactor(o.value, o.goal) },
    ),
    row("adr", a.value, a.goal, () =>
      a.goal === null ? { na: "Sin meta de venta promedio" } : a.value === null ? { na: "Sin datos del mes" } : { factor: tierFactor(a.value, a.goal) },
    ),
    row("booking", b.value, b.goal, () => {
      if (b.goal === null) return { na: "Sin meta de puntaje" };
      if (b.value === null) return { na: "Sin puntaje registrado" };
      let factor = tierFactor(b.value, b.goal);
      let note: string | undefined;
      if (b.previous !== null && b.value < b.previous - 0.05 && factor === 1) {
        factor = 0.5;
        note = `Bajó respecto del mes anterior (${b.previous.toLocaleString("es-CL")} → ${b.value.toLocaleString("es-CL")})`;
      }
      return { factor, note };
    }),
    row("survey", s.value, s.goal, () =>
      s.responses < s.minResponses || s.value === null
        ? { na: `Solo ${s.responses} respuesta(s); se necesitan ${s.minResponses}` }
        : { factor: tierFactor(s.value, s.goal) },
    ),
    row("inspections", i.avgWaitMinutes, i.maxWaitMinutes, () => {
      if (i.cleanings === null || i.cleanings === 0) return { na: "Sin aseos terminados en el mes" };
      const allInspected = i.inspected >= i.cleanings;
      const onTime = i.avgWaitMinutes !== null && i.avgWaitMinutes <= i.maxWaitMinutes;
      const criteria: BonusCriterion[] = [
        { label: "Todos los aseos inspeccionados", ok: allInspected, text: `${i.inspected} de ${i.cleanings} aseos` },
        {
          label: `Inspección dentro de ${i.maxWaitMinutes} min`,
          ok: onTime,
          text: i.avgWaitMinutes === null ? "sin inspecciones" : `promedio ${i.avgWaitMinutes} min`,
        },
      ];
      return { factor: allInspected && onTime ? 1 : 0, criteria };
    }),
    row("order", null, null, () => {
      const criteria: BonusCriterion[] = [];
      if (ord.closings && ord.closings.due > 0) {
        const late = ord.closings.due - ord.closings.onTime;
        criteria.push({
          label: "Cierres diarios a tiempo",
          ok: late === 0,
          text:
            late === 0
              ? `${ord.closings.due} de ${ord.closings.due} días`
              : `${ord.closings.onTime} de ${ord.closings.due} días (atrasados o sin cerrar: ${ord.closings.lateDays.join(", ")})`,
        });
      }
      if (ord.balances) {
        criteria.push({
          label: "Sin saldos pendientes de estadías terminadas",
          ok: ord.balances.count === 0,
          text: ord.balances.count === 0 ? "ninguno" : `${plural(ord.balances.count, "estadía", "estadías")} por ${clp(ord.balances.total)}`,
        });
      }
      if (!criteria.length) return { na: "Sin datos de orden" };
      const met = criteria.filter((c) => c.ok).length;
      return { factor: met / criteria.length, criteria };
    }),
  ];

  const evaluatedWeight = rows.reduce((sum, x) => sum + (x.status === "na" ? 0 : x.weight), 0);
  for (const x of rows) {
    if (x.status === "na" || evaluatedWeight === 0) continue;
    x.effectiveWeight = (x.weight / evaluatedWeight) * 100;
    x.earned = x.effectiveWeight * x.factor;
  }
  const points = rows.reduce((sum, x) => sum + x.earned, 0);
  const orderRow = rows.find((x) => x.key === "order")!;
  const gateApplied = orderRow.status === "miss";
  const amountBeforeGate = Math.round((input.pool * points) / 100);
  const amount = Math.round(amountBeforeGate * (gateApplied ? GATE_MULTIPLIER : 1));
  return { rows, points, evaluatedWeight, gateApplied, amountBeforeGate, amount };
}

export type BonusResult = ReturnType<typeof computeBonus>;
