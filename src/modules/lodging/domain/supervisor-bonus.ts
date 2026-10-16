/**
 * Bono mensual del supervisor de cada hostal (un supervisor por hostal).
 * 60 puntos salen del resultado de su hostal (el puntaje de la recepción) y
 * 40 de cuatro controles de supervisión de cumple o no cumple, 10 puntos cada
 * uno. Un control que no se puede evaluar se deja fuera y su peso se reparte
 * entre los demás, igual que en el bono de recepción.
 */

export const SUPERVISOR_WEIGHTS = { result: 60, audits: 10, receipts: 10, closings: 10, booking: 10 } as const;
export type SupervisorKey = keyof typeof SUPERVISOR_WEIGHTS;

export const SUPERVISOR_LABELS: Record<SupervisorKey, string> = {
  result: "Resultado de su hostal",
  audits: "Auditorías semanales completas",
  receipts: "Comprobantes con diferencia resueltos",
  closings: "Cierres sin correcciones",
  booking: "Valoración en Booking",
};

/** Máximo de cierres del mes que pueden haberse corregido (%). */
export const MAX_CORRECTED_CLOSINGS_PCT = 10;
/** Horas que tiene el supervisor para resolver un comprobante con diferencia. */
export const RECEIPT_RESOLVE_HOURS = 48;

export type SupervisorStatus = "met" | "half" | "miss" | "na";

export type SupervisorInput = {
  pool: number;
  /** Puntaje de la recepción del hostal (0 a 100). */
  receptionPoints: number;
  /** Auditorías asignadas en el mes y cuántas se completaron; null si no hay datos. */
  audits: { assigned: number; completed: number } | null;
  /** Comprobantes con diferencia que siguen sin resolver pasadas las 48 horas; null si no hay datos. */
  receipts: { overdue: number } | null;
  /** Cierres emitidos en el mes y cuántos se corrigieron (reemitidos o con autorización de fecha anterior). */
  closings: { total: number; corrected: number; correctedDays: number[] } | null;
  booking: { value: number | null; goal: number | null };
};

export type SupervisorRow = {
  key: SupervisorKey;
  label: string;
  weight: number;
  effectiveWeight: number;
  status: SupervisorStatus;
  factor: number;
  earned: number;
  /** Cómo quedó el control, en palabras. */
  text: string;
};

export function computeSupervisorBonus(input: SupervisorInput) {
  const row = (key: SupervisorKey, out: { factor: number; text: string } | { na: string }): SupervisorRow => {
    const base = { key, label: SUPERVISOR_LABELS[key], weight: SUPERVISOR_WEIGHTS[key], effectiveWeight: 0, earned: 0 };
    if ("na" in out) return { ...base, status: "na", factor: 0, text: out.na };
    return { ...base, factor: out.factor, status: out.factor === 1 ? "met" : out.factor === 0 ? "miss" : "half", text: out.text };
  };
  const bookingValue = input.booking.value;
  const bookingGoal = input.booking.goal;
  const rows: SupervisorRow[] = [
    row("result", {
      factor: Math.min(Math.max(input.receptionPoints, 0), 100) / 100,
      text: `${(Math.round(input.receptionPoints * 10) / 10).toLocaleString("es-CL")} de 100 puntos de la recepción`,
    }),
    row(
      "audits",
      !input.audits || input.audits.assigned === 0
        ? { na: "Sin auditorías asignadas en el mes" }
        : {
            factor: input.audits.completed >= input.audits.assigned ? 1 : 0,
            text: `${input.audits.completed} de ${input.audits.assigned} auditorías completadas`,
          },
    ),
    row(
      "receipts",
      !input.receipts
        ? { na: "Sin datos de comprobantes" }
        : {
            factor: input.receipts.overdue === 0 ? 1 : 0,
            text:
              input.receipts.overdue === 0
                ? `Ninguno pendiente por más de ${RECEIPT_RESOLVE_HOURS} h`
                : `${input.receipts.overdue} sin resolver por más de ${RECEIPT_RESOLVE_HOURS} h`,
          },
    ),
    row(
      "closings",
      !input.closings || input.closings.total === 0
        ? { na: "Sin cierres emitidos en el mes" }
        : (() => {
            const pct = (input.closings.corrected / input.closings.total) * 100;
            return {
              factor: pct <= MAX_CORRECTED_CLOSINGS_PCT ? 1 : 0,
              text: `${input.closings.corrected} de ${input.closings.total} cierres corregidos (${Math.round(pct)}%, máximo ${MAX_CORRECTED_CLOSINGS_PCT}%)${
                input.closings.correctedDays.length ? `; días ${input.closings.correctedDays.join(", ")}` : ""
              }`,
            };
          })(),
    ),
    row(
      "booking",
      bookingGoal === null
        ? { na: "Sin meta de puntaje" }
        : bookingValue === null
          ? { na: "Sin puntaje registrado" }
          : {
              factor: bookingValue + 1e-9 >= bookingGoal ? 1 : 0,
              text: `${bookingValue.toLocaleString("es-CL")} (meta ${bookingGoal.toLocaleString("es-CL")})`,
            },
    ),
  ];
  const evaluatedWeight = rows.reduce((sum, x) => sum + (x.status === "na" ? 0 : x.weight), 0);
  for (const x of rows) {
    if (x.status === "na" || evaluatedWeight === 0) continue;
    x.effectiveWeight = (x.weight / evaluatedWeight) * 100;
    x.earned = x.effectiveWeight * x.factor;
  }
  const points = rows.reduce((sum, x) => sum + x.earned, 0);
  const amount = Math.round((input.pool * points) / 100);
  return { rows, points, evaluatedWeight, amount };
}

export type SupervisorResult = ReturnType<typeof computeSupervisorBonus>;
