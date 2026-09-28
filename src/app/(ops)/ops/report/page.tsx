import Link from "next/link";
import { redirect } from "next/navigation";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { PhotoPicker } from "@/components/ops/photo-picker";
import { loadBoard, opsContext } from "@/modules/lodging/application/ops-queries";
import { reportIncidentAction } from "@/modules/lodging/application/ops-actions";
import { incidentCategories, incidentPriorities, MAX_PHOTOS } from "@/modules/lodging/domain/incidents";

/** REPORTAR PROBLEMA: tipo, descripción corta, prioridad, fotos y bloqueo según permiso. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ room?: string; error?: string }> }) {
  const q = await searchParams;
  const { unit, can, supabase } = await opsContext();
  if (!can.report) redirect("/ops");
  const board = await loadBoard(supabase, unit.id);
  const room = board.rooms.find((r) => r.id === q.room);
  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <h1 className="mb-1 text-2xl font-bold">Reportar problema</h1>
      <p className="mb-4 text-sm text-slate-600">{room ? room.name : unit.name}</p>
      {q.error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{q.error}</p>}
      <form action={reportIncidentAction} className="space-y-5">
        <input type="hidden" name="unit_id" value={unit.id} />
        {room ? (
          <input type="hidden" name="room_id" value={room.id} />
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-slate-700">Habitación</span>
            <select name="room_id" className="h-12 w-full rounded-xl border bg-white px-3 text-base">
              <option value="">Áreas comunes / sin habitación</option>
              {[...board.rooms]
                .sort((a, b) => a.display_order - b.display_order)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-700">¿Qué pasa?</legend>
          <div className="grid grid-cols-3 gap-2">
            {incidentCategories.map(([key, label, icon]) => (
              <label
                key={key}
                className="flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-transparent bg-white p-2 text-center text-xs font-semibold shadow-sm has-[:checked]:border-[#2a78d6] has-[:checked]:bg-blue-50"
              >
                <input type="radio" name="category" value={key} required className="sr-only" />
                <span className="text-xl" aria-hidden>
                  {icon}
                </span>
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">Descripción</span>
          <textarea name="description" required minLength={3} maxLength={1000} rows={3} placeholder="Ej.: la ducha no calienta" className="w-full rounded-xl border p-3 text-base" />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-700">Prioridad</legend>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(incidentPriorities).map(([key, label]) => (
              <label
                key={key}
                className="flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-transparent bg-white text-sm font-semibold shadow-sm has-[:checked]:border-[#2a78d6] has-[:checked]:bg-blue-50"
              >
                <input type="radio" name="priority" value={key} defaultChecked={key === "medium"} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {room && can.blockMaintenance && (
          <fieldset className="rounded-2xl bg-white p-4 shadow-sm">
            <legend className="sr-only">Habitabilidad</legend>
            <p className="mb-2 text-sm font-bold text-slate-700">¿Se puede usar la habitación?</p>
            <div className="space-y-2 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="block" value="" defaultChecked className="size-5" /> Sí, se puede usar
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="block" value="maintenance" className="size-5" /> No: bloquear por mantención
              </label>
              {can.maintenanceManage && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="block" value="out_of_service" className="size-5" /> No: dejar fuera de servicio
                </label>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Al resolverse vuelve a inspección antes de quedar disponible.</p>
          </fieldset>
        )}

        <PhotoPicker max={MAX_PHOTOS} />
        <OpsSubmit className="bg-[#d03b3b] text-white">ENVIAR REPORTE</OpsSubmit>
      </form>
    </>
  );
}
