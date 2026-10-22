import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { loadHostels, luciaContext } from "@/modules/lucia/application/queries";
import { saveStaffAnswerAction } from "@/modules/lucia/application/actions";
import { questionsForHostel } from "@/modules/lucia/domain/staff-questions";
import { LuciaTabs, Notice, inputClass } from "@/modules/lucia/ui";

type Answer = { question_code: string; user_id: string; author_name: string; answer: string; updated_at: string };

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Preguntas a recepción. Se muestra dentro del ERP (con sus pestañas) y como
 * página aislada (/preguntas-recepcion, sin los paneles del ERP); ambas piden
 * sesión y los mismos permisos.
 */
export async function StaffQuestionsView({
  searchParams,
  basePath,
  standalone = false,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  basePath: "/lodging/lucia/preguntas" | "/preguntas-recepcion";
  standalone?: boolean;
}) {
  const q = await searchParams;
  const { ctx, supabase } = await luciaContext("lucia.inbox.view");
  const myUnits = new Set(ctx.units.map((u) => u.id));
  // Solo las hostales de Lucía a las que esta persona tiene acceso.
  const hostels = (await loadHostels(supabase)).filter((h) => myUnits.has(h.business_unit_id));
  const order = ["HOB", "HOC", "HU"];
  hostels.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const current = hostels.find((h) => h.code === q.hostal) ?? hostels[0];
  const canReply = ctx.permissions.has("lucia.inbox.reply");

  const { data } = current
    ? await supabase
        .from("lucia_staff_answers")
        .select("question_code,user_id,author_name,answer,updated_at")
        .eq("business_unit_id", current.business_unit_id)
        .order("updated_at")
    : { data: [] };
  const answers = (data ?? []) as Answer[];
  const questions = current ? questionsForHostel(current.code) : [];
  const answered = questions.filter((question) => answers.some((a) => a.question_code === question.code)).length;

  return (
    <>
      <PageHeader
        eyebrow={standalone ? `Hostales Oasis · ${ctx.profile.first_name}` : "Hostales · Lucía"}
        title="Preguntas a recepción"
        description="Revisamos las habitaciones, precios y manuales que usa Lucía para responder a los clientes. Con estas respuestas corregimos el ERP para que no dé información equivocada. Cada recepcionista tiene su propia respuesta: verás también lo que respondieron las demás."
      />
      {!standalone && <LuciaTabs active="preguntas" permissions={ctx.permissions} />}
      <Notice success={q.success} error={q.error} />
      {!current ? (
        <Panel>
          <p className="text-sm text-slate-500">No tienes acceso a ninguna de las hostales de Lucía.</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {hostels.map((h) => (
              <Link
                key={h.code}
                href={`${basePath}?hostal=${h.code}`}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  h.code === current.code ? "border-[var(--oasis-primary)] bg-[var(--oasis-primary)] text-white" : "bg-white hover:border-[var(--oasis-primary)]"
                }`}
              >
                {h.display_name}
              </Link>
            ))}
            <span className="ml-auto text-sm font-semibold text-[var(--oasis-primary)]">
              {answered} de {questions.length} preguntas con respuesta
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Escribe tu respuesta y toca <b>Guardar</b>. Si lo que dice el recuadro gris está bien, toca <b>Correcto</b>. Puedes corregir tu respuesta cuando quieras.
          </p>
          {questions.map((question) => {
            const list = answers.filter((a) => a.question_code === question.code);
            const mine = list.find((a) => a.user_id === ctx.user.id);
            const others = list.filter((a) => a.user_id !== ctx.user.id);
            return (
              <Panel key={question.code}>
                <div id={question.code} className="grid scroll-mt-24 gap-3 md:grid-cols-[3.5rem_1fr]">
                  <span className="font-semibold text-[var(--oasis-primary)]">{question.code}</span>
                  <div className="min-w-0 space-y-3">
                    <p className="font-semibold">{question.question}</p>
                    <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                      <b className="text-slate-800">Hoy:</b> {question.current}
                    </p>
                    {others.map((a) => (
                      <div key={a.user_id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-emerald-800">
                          {a.author_name || "Alguien del equipo"} · {when(a.updated_at)}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{a.answer}</p>
                      </div>
                    ))}
                    {canReply ? (
                      <form action={saveStaffAnswerAction} className="space-y-2">
                        <input type="hidden" name="question_code" value={question.code} />
                        <input type="hidden" name="return_to" value={basePath} />
                        <input type="hidden" name="hostel_code" value={current.code} />
                        <input type="hidden" name="business_unit_id" value={current.business_unit_id} />
                        <label htmlFor={`r-${question.code}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Tu respuesta{mine ? ` · guardada ${when(mine.updated_at)}` : ""}
                        </label>
                        <textarea
                          id={`r-${question.code}`}
                          name="answer"
                          rows={2}
                          maxLength={2000}
                          defaultValue={mine?.answer ?? ""}
                          placeholder="Escribe aquí tu respuesta"
                          className={inputClass}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">Guardar</button>
                          <button name="quick" value="Correcto" className="rounded-xl border border-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-[var(--oasis-primary)]">
                            Correcto
                          </button>
                        </div>
                      </form>
                    ) : (
                      !list.length && <p className="text-sm text-slate-500">Sin respuestas todavía.</p>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
