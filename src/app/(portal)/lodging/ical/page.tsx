import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext } from "@/modules/lodging/application/queries";
import { saveIcalConfigAction } from "@/modules/lodging/application/actions";
import { SyncButton } from "@/components/lodging/sync-button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, company, supabase } =
    await lodgingContext("lodging.ical.sync");
  const [{ data: rooms }, { data: configs }] = await Promise.all([
    supabase
      .from("lodging_rooms")
      .select("id,name,export_token,export_enabled")
      .eq("business_unit_id", unit.id)
      .order("display_order"),
    supabase
      .from("lodging_ical_configs")
      .select(
        "id,name,provider,active,last_sync_at,last_result,lodging_rooms(name)",
      )
      .eq("business_unit_id", unit.id),
  ]);
  const can = ctx.permissions.has("lodging.ical.configure"),
    base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    field = "rounded-xl border px-3 py-2 text-sm";
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4">
        <PageHeader
          eyebrow="Hostal Uruguay"
          title="Sincronización iCal"
          description="Importa disponibilidad de Booking y Airbnb y comparte el calendario privado de cada habitación."
        />
        <SyncButton unitId={unit.id} />
      </div>
      {(q.success || q.error) && (
        <p
          className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {q.error || q.success}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-semibold">Calendarios externos</h2>
          <div className="mt-4 space-y-3">
            {(configs ?? []).map((c) => {
              const relatedRoom = c.lodging_rooms as unknown as
                { name: string } | { name: string }[] | null;
              return (
                <div key={c.id} className="rounded-xl border p-3 text-sm">
                  <b>{c.name}</b>
                  <span className="ml-2 capitalize text-slate-500">
                    {c.provider}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {Array.isArray(relatedRoom)
                      ? relatedRoom[0]?.name
                      : relatedRoom?.name}{" "}
                    ·{" "}
                    {c.last_sync_at
                      ? `Última actualización ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(c.last_sync_at))}`
                      : "Aún no sincronizado"}{" "}
                    · {c.last_result ?? "pendiente"}
                  </span>
                </div>
              );
            })}
            {!configs?.length && (
              <p className="text-sm text-slate-500">
                No hay calendarios externos configurados.
              </p>
            )}
          </div>
          {can && (
            <form
              action={saveIcalConfigAction}
              className="mt-5 grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="company_id" value={company.id} />
              <input type="hidden" name="business_unit_id" value={unit.id} />
              <select name="room_id" className={field}>
                {(rooms ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select name="provider" className={field}>
                <option value="booking">Booking</option>
                <option value="airbnb">Airbnb</option>
                <option value="other">Otro</option>
              </select>
              <input
                name="name"
                required
                placeholder="Nombre del calendario"
                className={field}
              />
              <input
                name="import_url"
                type="url"
                required
                placeholder="https://…/calendar.ics"
                className={field}
              />
              <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
                Validar, guardar e importar
              </button>
            </form>
          )}
        </Panel>
        <Panel>
          <h2 className="font-semibold">Calendarios Oasis por habitación</h2>
          <p className="mt-2 text-xs text-slate-500">
            Estos enlaces contienen únicamente periodos no disponibles; nunca
            incluyen datos personales.
          </p>
          <div className="mt-4 space-y-3">
            {(rooms ?? []).map((r) => {
              const url = `${base}/api/ical/rooms/${r.export_token}.ics`;
              return (
                <div key={r.id} className="rounded-xl border p-3 text-sm">
                  <b>{r.name}</b>
                  <input
                    readOnly
                    value={url}
                    className="mt-2 w-full rounded-lg bg-slate-50 px-2 py-1.5 text-xs"
                  />
                  <a
                    href={url}
                    className="mt-2 inline-block text-xs font-semibold text-[#1c6748]"
                  >
                    Verificar / descargar
                  </a>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}
