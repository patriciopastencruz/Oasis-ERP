"use client";
import { useState } from "react";
import {
  REVIEW_CATEGORIES,
  parseBookingReviewText,
} from "@/modules/lodging/domain/review-scores";

const input = "mt-1 block w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm";
const fmt = (n: number) => String(n).replace(".", ",");

/** Formulario de registro con un atajo: pegar el texto copiado de la ficha de Booking. */
export function ReviewScoreForm({
  units,
  today,
  action,
}: {
  units: { id: string; name: string }[];
  today: string;
  action: (form: FormData) => void | Promise<void>;
}) {
  const [score, setScore] = useState("");
  const [count, setCount] = useState("");
  const [cats, setCats] = useState<Record<string, string>>({});
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function readPasted() {
    const parsed = parseBookingReviewText(pasted);
    if (!parsed) {
      setNote({
        ok: false,
        text: "No encontré el puntaje. Copia desde “Comentarios de los clientes” hasta las categorías y vuelve a pegar.",
      });
      return;
    }
    setScore(fmt(parsed.score));
    setCount(String(parsed.reviewCount));
    setCats(
      Object.fromEntries(
        Object.entries(parsed.categories).map(([k, v]) => [k, fmt(v as number)]),
      ),
    );
    setNote({
      ok: true,
      text: `Leí ${fmt(parsed.score)} con ${parsed.reviewCount} comentarios y ${Object.keys(parsed.categories).length} categorías. Elige el hostal y guarda.`,
    });
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <details className="rounded-lg border border-dashed p-3 text-sm" open>
        <summary className="cursor-pointer font-semibold text-[#0b4f9c]">
          Pegar desde Booking
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          En la ficha del hostal en Booking, selecciona y copia el bloque de
          puntuaciones (o toda la página), pégalo aquí y toca “Leer texto”.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder="Pega aquí el texto de Booking…"
          className={`${input} font-mono text-xs`}
        />
        <button
          type="button"
          onClick={readPasted}
          disabled={!pasted.trim()}
          className="mt-2 rounded-lg border border-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-[#0b4f9c] disabled:opacity-50"
        >
          Leer texto
        </button>
        {note && (
          <p className={`mt-2 text-xs ${note.ok ? "text-emerald-700" : "text-red-700"}`}>
            {note.text}
          </p>
        )}
      </details>

      <label className="block text-sm">
        Hostal
        <select name="unit_id" required className={input}>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 block text-sm sm:col-span-1">
          Fecha
          <input type="date" name="recorded_on" defaultValue={today} max={today} className={input} />
        </label>
        <label className="block text-sm">
          Puntaje
          <input name="score" value={score} onChange={(e) => setScore(e.target.value)} inputMode="decimal" placeholder="7,3" required className={input} />
        </label>
        <label className="block text-sm">
          Comentarios
          <input name="review_count" value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" placeholder="11" required className={input} />
        </label>
      </div>
      <p className="text-xs font-semibold text-slate-600">Por categoría (opcional)</p>
      <div className="grid grid-cols-2 gap-2">
        {REVIEW_CATEGORIES.map(({ key, label }) => (
          <label key={key} className="block text-xs">
            {label}
            <input
              name={`cat_${key}`}
              value={cats[key] ?? ""}
              onChange={(e) => setCats((c) => ({ ...c, [key]: e.target.value }))}
              inputMode="decimal"
              placeholder="—"
              className={input}
            />
          </label>
        ))}
      </div>
      <button className="w-full rounded-xl bg-[#0b4f9c] px-4 py-2.5 text-sm font-semibold text-white">
        Guardar registro
      </button>
    </form>
  );
}
