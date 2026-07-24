import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";
import {
  updateAssistantSettingsAction,
  resolveUnresolvedQuestionAction,
  createArticleFromQuestionAction,
  toggleArticleAction,
} from "@/modules/assistant/application/admin-actions";

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm";

export default async function AssistantAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    module?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const q = await searchParams;
  const ctx = await requirePermission("assistant.admin.manage");
  const companyId = ctx.companies[0]?.id ?? "";
  const supabase = await createSupabaseServerClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    { data: settings },
    { count: totalConversations },
    { count: messagesToday },
    { count: pendingQuestions },
    { count: helpfulCount },
    { count: notHelpfulCount },
    { data: articles },
  ] = await Promise.all([
    supabase
      .from("assistant_settings")
      .select("enabled,daily_message_limit,welcome_message")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("assistant_conversations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", startOfDay.toISOString()),
    supabase
      .from("assistant_unresolved_questions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    supabase
      .from("assistant_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "helpful"),
    supabase
      .from("assistant_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "not_helpful"),
    supabase
      .from("assistant_knowledge_articles")
      .select("id,title,module_key,validation_status,active")
      .eq("company_id", companyId)
      .order("module_key"),
  ]);

  let questionsQuery = supabase
    .from("assistant_unresolved_questions")
    .select("id,question,module,route,status,created_at,resolution")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (q.status) questionsQuery = questionsQuery.eq("status", q.status);
  if (q.module) questionsQuery = questionsQuery.eq("module", q.module);
  const { data: questions } = await questionsQuery;

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Configuración del Asistente ERP"
        description="Activa el asistente, ajusta su límite de consultas, gestiona preguntas no resueltas y el conocimiento verificado."
      />

      {q.success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
          {q.success}
        </p>
      )}
      {q.error && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {q.error}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Conversaciones totales", totalConversations ?? 0],
          ["Mensajes hoy", messagesToday ?? 0],
          ["Preguntas pendientes", pendingQuestions ?? 0],
          ["Útil / No útil", `${helpfulCount ?? 0} / ${notHelpfulCount ?? 0}`],
        ].map(([label, value]) => (
          <Panel key={label as string}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </Panel>
        ))}
      </div>

      <Panel className="mb-6">
        <h2 className="font-semibold">Configuración general</h2>
        <form
          action={updateAssistantSettingsAction}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings?.enabled ?? true}
            />
            Asistente habilitado
          </label>
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Límite diario de consultas por usuario
            </label>
            <input
              name="daily_message_limit"
              type="number"
              min="1"
              defaultValue={settings?.daily_message_limit ?? 60}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">
              Mensaje inicial
            </label>
            <textarea
              name="welcome_message"
              defaultValue={settings?.welcome_message ?? ""}
              rows={3}
              className={inputClass}
            />
          </div>
          <button className="rounded-xl bg-[#083f7d] px-4 py-2.5 text-sm font-semibold text-white md:col-span-2">
            Guardar configuración
          </button>
        </form>
      </Panel>

      <Panel className="mb-6">
        <h2 className="font-semibold">Preguntas no resueltas</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {["pending", "reviewed", "resolved"].map((s) => (
            <a
              key={s}
              href={`/admin/assistant?status=${s}`}
              className={`rounded-full border px-3 py-1 ${q.status === s ? "bg-[var(--oasis-soft)] font-semibold" : ""}`}
            >
              {s}
            </a>
          ))}
          <a href="/admin/assistant" className="rounded-full border px-3 py-1">
            Todas
          </a>
        </div>
        <div className="mt-4 space-y-4">
          {(questions ?? []).map((question) => (
            <div key={question.id} className="rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{question.question}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {question.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Módulo: {question.module ?? "—"} · Ruta: {question.route ?? "—"}{" "}
                · {new Date(question.created_at).toLocaleString("es-CL")}
              </p>
              {question.resolution && (
                <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                  {question.resolution}
                </p>
              )}
              {question.status !== "resolved" && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <form
                    action={resolveUnresolvedQuestionAction}
                    className="space-y-2"
                  >
                    <input type="hidden" name="id" value={question.id} />
                    <input
                      name="resolution"
                      placeholder="Respuesta / resolución"
                      className={inputClass}
                    />
                    <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold">
                      Marcar como resuelta
                    </button>
                  </form>
                  <form
                    action={createArticleFromQuestionAction}
                    className="space-y-2"
                  >
                    <input
                      type="hidden"
                      name="question_id"
                      value={question.id}
                    />
                    <input
                      name="title"
                      placeholder="Título del artículo"
                      required
                      className={inputClass}
                    />
                    <input
                      name="module_key"
                      placeholder="Módulo (ej. payment_control)"
                      defaultValue={question.module ?? ""}
                      required
                      className={inputClass}
                    />
                    <textarea
                      name="content"
                      placeholder="Contenido verificado de la respuesta"
                      required
                      rows={2}
                      className={inputClass}
                    />
                    <input
                      name="keywords"
                      placeholder="palabras clave, separadas por coma"
                      className={inputClass}
                    />
                    <button className="rounded-lg bg-[#0b4f9c] px-3 py-1.5 text-xs font-semibold text-white">
                      Crear artículo desde esta pregunta
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
          {!questions?.length && (
            <p className="text-sm text-slate-500">
              No hay preguntas para este filtro.
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <h2 className="font-semibold">Artículos de conocimiento</h2>
        <div className="mt-3 space-y-2">
          {(articles ?? []).map((article) => (
            <div
              key={article.id}
              className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{article.title}</p>
                <p className="text-xs text-slate-500">
                  {article.module_key} · {article.validation_status}
                </p>
              </div>
              <form action={toggleArticleAction}>
                <input type="hidden" name="id" value={article.id} />
                <input
                  type="hidden"
                  name="active"
                  value={String(article.active)}
                />
                <button className="rounded-lg border px-3 py-1 text-xs font-semibold">
                  {article.active ? "Desactivar" : "Activar"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
