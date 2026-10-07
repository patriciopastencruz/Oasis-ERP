import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { submitSurveyAction } from "@/modules/lodging/application/survey-actions";
import { SURVEY_CATEGORIES } from "@/modules/lodging/domain/survey";

export const metadata = {
  title: "Tu opinión | Hostal Oasis",
  description: "Cuéntanos cómo fue tu estadía y ayúdanos a mejorar.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SCORE_LABELS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"];

function Pill({
  name,
  value,
  children,
  required,
}: {
  name: string;
  value: number;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        required={required}
        className="peer sr-only"
      />
      <span className="grid h-11 min-w-11 place-items-center rounded-xl border border-[#e4d9c8] bg-white px-2 text-sm font-semibold text-[#3a2f26] peer-checked:border-[#c1652f] peer-checked:bg-[#c1652f] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#c1652f]/40">
        {children}
      </span>
    </label>
  );
}

export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ gracias?: string; error?: string }>;
}) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();

  const db = createSupabaseAdminClient();
  const { data: room } = await db
    .from("lodging_rooms")
    .select("name,business_units(name)")
    .eq("survey_token", token)
    .eq("active", true)
    .maybeSingle();
  if (!room) notFound();
  const unit = Array.isArray(room.business_units)
    ? room.business_units[0]
    : room.business_units;

  if (q.gracias)
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-5xl">🙏</p>
        <h1
          className="mt-4 text-3xl font-bold text-[#241c16]"
          style={{ fontFamily: "var(--font-playfair), serif" }}
        >
          ¡Gracias por tu opinión!
        </h1>
        <p className="mt-3 text-sm text-[#6b5d4f]">
          La leemos con atención para mejorar. Esperamos verte pronto en{" "}
          {unit?.name ?? "nuestro hostal"}.
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c1652f]">
        {unit?.name ?? "Hostal Oasis"} · {room.name}
      </p>
      <h1
        className="mt-2 text-3xl font-bold text-[#241c16]"
        style={{ fontFamily: "var(--font-playfair), serif" }}
      >
        ¿Cómo fue tu estadía?
      </h1>
      <p className="mt-2 text-sm text-[#6b5d4f]">
        Son menos de 2 minutos. Tu opinión nos ayuda a mejorar.
      </p>

      {q.error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {q.error}
        </div>
      )}

      <form action={submitSurveyAction} className="mt-8 space-y-8">
        <input type="hidden" name="token" value={token} />
        {/* Honeypot: oculto para personas, los bots lo completan. */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label>
            Sitio web
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {SURVEY_CATEGORIES.map((category) => (
          <fieldset key={category.key}>
            <legend className="text-sm font-semibold text-[#241c16]">
              {category.question}
            </legend>
            <div className="mt-3 flex gap-2">
              {SCORE_LABELS.map((label, index) => (
                <Pill
                  key={label}
                  name={category.key}
                  value={index + 1}
                  required={index === 0}
                >
                  {index + 1}
                </Pill>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-[#8a7b6a]">
              <span>{SCORE_LABELS[0]}</span>
              <span>{SCORE_LABELS[4]}</span>
            </div>
          </fieldset>
        ))}

        <fieldset>
          <legend className="text-sm font-semibold text-[#241c16]">
            ¿Qué tan probable es que nos recomiendes a un amigo o familiar?
          </legend>
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pill key={n} name="recommend" value={n} required={n === 1}>
                {n}
              </Pill>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-[#8a7b6a]">
            <span>Nada probable</span>
            <span>Muy probable</span>
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-[#241c16]">
          ¿Cómo podemos mejorar?
          <textarea
            name="comment"
            rows={4}
            maxLength={1000}
            placeholder="Cuéntanos qué te gustó y qué cambiarías (opcional)"
            className="mt-2 block w-full rounded-xl border border-[#e4d9c8] bg-white px-3.5 py-2.5 text-sm font-normal text-[#241c16] outline-none focus:border-[#c1652f]"
          />
        </label>

        <details className="rounded-xl border border-[#e4d9c8] bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-[#3a2f26]">
            ¿Quieres que te contactemos? (opcional)
          </summary>
          <div className="mt-3 space-y-3">
            <input
              name="guest_name"
              maxLength={120}
              placeholder="Tu nombre"
              className="block w-full rounded-xl border border-[#e4d9c8] px-3.5 py-2.5 outline-none focus:border-[#c1652f]"
            />
            <input
              name="contact"
              maxLength={160}
              placeholder="Teléfono o correo"
              className="block w-full rounded-xl border border-[#e4d9c8] px-3.5 py-2.5 outline-none focus:border-[#c1652f]"
            />
          </div>
        </details>

        <button className="w-full rounded-full bg-[#c1652f] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#a4531f]">
          Enviar mi opinión
        </button>
      </form>
    </main>
  );
}
