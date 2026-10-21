import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { luciaContext, prospectStatusLabels } from "@/modules/lucia/application/queries";
import { startSimulationAction } from "@/modules/lucia/application/actions";
import { LuciaTabs, Notice, formatDateTime, inputClass } from "@/modules/lucia/ui";

export default async function LuciaSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.settings.manage");
  const { data: recent } = await supabase
    .from("lucia_conversations")
    .select("id,contact_name,prospect_status,status,last_message_at")
    .eq("channel", "simulator")
    .order("created_at", { ascending: false })
    .limit(15);

  return (
    <>
      <PageHeader
        eyebrow="Hostales · Lucía"
        title="Simulador de conversaciones"
        description={`Escribe como si fueras un cliente y revisa qué respondería ${settings.agent_name}, con las mismas instrucciones, manuales y reglas que usará en WhatsApp. Nada sale del ERP, pero cada respuesta sí consume tokens de Claude y cuenta para el tope diario.`}
      />
      <LuciaTabs active="simulador" permissions={ctx.permissions} />
      <Notice success={q.success} error={q.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-semibold">Nueva conversación de prueba</h2>
          <form action={startSimulationAction} className="space-y-3">
            <label className="block text-sm">
              Nombre del cliente ficticio
              <input name="contact_name" placeholder="Ej: Turista de Santiago" className={inputClass} />
            </label>
            <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2 text-sm font-semibold text-white">
              Empezar simulación
            </button>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-semibold">Simulaciones recientes</h2>
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay simulaciones.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(recent ?? []).map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/lodging/lucia/${r.id}`} className="font-medium text-[var(--oasis-primary)] hover:underline">
                    {r.contact_name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {prospectStatusLabels[r.prospect_status]} · {formatDateTime(r.last_message_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
