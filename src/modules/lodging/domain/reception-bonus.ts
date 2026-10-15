/**
 * Bono mensual de recepción por cumplimiento de metas (un monto fijo por hostal).
 * Cada indicador reparte puntos según su peso: cumple la meta = todo su peso,
 * entre el 90% y el 99% de la meta = la mitad, menos = nada. Si un indicador no
 * se puede evaluar (sin meta o sin datos suficientes) se deja fuera y su peso se
 * reparte entre los demás, para no premiar ni castigar por falta de información.
 */

export const BONUS_INDICATORS = [
  { key: "occupancy", label: "Ocupación del mes" },
  { key: "revpar", label: "RevPAR del mes" },
  { key: "booking", label: "Puntaje de Booking" },
  { key: "survey", label: "Satisfacción de huéspedes (QR)" },
  { key: "housekeeping", label: "Aseo aprobado a la primera" },
  { key: "order", label: "Orden administrativo" },
] as const;

export type BonusKey = (typeof BONUS_INDICATORS)[number]["key"];
export type BonusWeights = Record<BonusKey, number>;

export const DEFAULT_BONUS_WEIGHTS: BonusWeights = {
  occupancy: 25,
  revpar: 25,
  booking: 20,
  survey: 10,
  housekeeping: 5,
  order: 15,
};

/** Cada día cuenta como máximo 110% de ocupación: una reventa no infla el premio. */
export const OCCUPANCY_DAY_CAP = 1.1;
/** Orden administrativo: desde 95 gana todo, desde 90 la mitad; bajo 90 además reduce el bono. */
export const ORDER_FULL = 95;
export const ORDER_HALF = 90;
export const GATE_MULTIPLIER = 0.5;

export type BonusStatus = "met" | "half" | "miss" | "na";

export type BonusInput = {
  pool: number;
  weights: BonusWeights;
  /** % de ocupación del mes (cada día con tope) y meta. */
  occupancy: { value: number | null; goal: number | null };
  revpar: { value: number | null; goal: number | null };
  /** Último puntaje del mes y el del mes anterior (para que no haya bajado). */
  booking: { value: number | null; goal: number | null; previous: number | null };
  survey: { value: number | null; goal: number; responses: number; minResponses: number };
  housekeeping: { value: number | null; goal: number | null };
  /** Porcentajes (0-100) de cierres emitidos, reservas con precio y pagos con comprobante. */
  order: { closings: number | null; prices: number | null; receipts: number | null };
};

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

const avg = (values: (number | null)[]) => {
  const list = values.filter((v): v is number => v !== null);
  return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null;
};

export function orderScore(o: BonusInput["order"]) {
  return avg([o.closings, o.prices, o.receipts]);
}

export function computeBonus(input: BonusInput) {
  const row = (
    key: BonusKey,
    value: number | null,
    goal: number | null,
    evaluate: () => { factor: number; note?: string } | { na: string },
  ): BonusRow => {
    const label = BONUS_INDICATORS.find((i) => i.key === key)!.label;
    const base = { key, label, weight: input.weights[key], effectiveWeight: 0, value, goal, earned: 0 };
    const out = evaluate();
    if ("na" in out) return { ...base, status: "na", factor: 0, note: out.na };
    return {
      ...base,
      factor: out.factor,
      status: out.factor === 1 ? "met" : out.factor === 0.5 ? "half" : "miss",
      note: out.note ?? null,
    };
  };

  const o = input.occupancy;
  const r = input.revpar;
  const b = input.booking;
  const s = input.survey;
  const h = input.housekeeping;
  const order = orderScore(input.order);

  const rows: BonusRow[] = [
    row("occupancy", o.value, o.goal, () =>
      o.goal === null ? { na: "Sin meta de ocupación" } : o.value === null ? { na: "Sin datos del mes" } : { factor: tierFactor(o.value, o.goal) },
    ),
    row("revpar", r.value, r.goal, () =>
      r.goal === null ? { na: "Sin meta de RevPAR" } : r.value === null ? { na: "Sin datos del mes" } : { factor: tierFactor(r.value, r.goal) },
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
    row("housekeeping", h.value, h.goal, () =>
      h.goal === null ? { na: "Sin meta de aseo" } : h.value === null ? { na: "Sin inspecciones en el mes" } : { factor: tierFactor(h.value, h.goal) },
    ),
    row("order", order, ORDER_FULL, () =>
      order === null ? { na: "Sin datos de orden" } : { factor: order >= ORDER_FULL ? 1 : order >= ORDER_HALF ? 0.5 : 0 },
    ),
  ];

  const evaluatedWeight = rows.reduce((sum, x) => sum + (x.status === "na" ? 0 : x.weight), 0);
  for (const x of rows) {
    if (x.status === "na" || evaluatedWeight === 0) continue;
    x.effectiveWeight = (x.weight / evaluatedWeight) * 100;
    x.earned = x.effectiveWeight * x.factor;
  }
  const points = rows.reduce((sum, x) => sum + x.earned, 0);
  const gateApplied = order !== null && order < ORDER_HALF;
  const amountBeforeGate = Math.round((input.pool * points) / 100);
  const amount = Math.round(amountBeforeGate * (gateApplied ? GATE_MULTIPLIER : 1));
  return { rows, points, evaluatedWeight, gateApplied, amountBeforeGate, amount, order };
}

export type BonusResult = ReturnType<typeof computeBonus>;
