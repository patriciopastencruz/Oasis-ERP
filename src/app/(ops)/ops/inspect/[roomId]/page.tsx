import Link from "next/link";
import { redirect } from "next/navigation";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { loadBoard, opsContext } from "@/modules/lodging/application/ops-queries";
import { inspectRoomAction } from "@/modules/lodging/application/ops-actions";
import { arrivalLabel, inspectionChecklist, rejectionReasons } from "@/modules/lodging/domain/operations";

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Inspección de recepción (100% de las habitaciones limpiadas): aprobar o rechazar. */
export default async function InspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ roomId }, q] = await Promise.all([params, searchParams]);
  const { unit, supabase, can } = await opsContext();
  if (!can.inspect) redirect("/ops");
  const board = await loadBoard(supabase, unit.id);
  const room = board.rooms.find((r) => r.id === roomId && r.operational_status === "pending_inspection");
  if (!room) redirect("/ops?error=" + encodeURIComponent("Esta habitación ya no está pendiente de inspección."));
  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Inspeccionar {room.name}</h1>
        {room.awaiting && (
          <p className="mt-1 text-sm text-slate-600">
            Limpieza terminada {hhmm(room.awaiting.completed_at)}
            {room.awaiting.completed_by_name ? ` por ${room.awaiting.completed_by_name}` : ""}
            {room.awaiting.duration_minutes !== null ? ` · ${room.awaiting.duration_minutes} min` : ""}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-600">Próximo check-in: {arrivalLabel(room, board.today)}</p>
      </div>
      {q.error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{q.error}</p>}

      <form action={inspectRoomAction} className="rounded-3xl bg-white p-4 shadow-sm">
        <input type="hidden" name="room_id" value={room.id} />
        <p className="mb-2 text-sm font-bold text-slate-700">Revisa y desmarca lo que no está bien</p>
        <div className="grid grid-cols-1 gap-2">
          {inspectionChecklist.map(([key, label]) => (
            <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl border px-3 text-sm has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50">
              <input type="checkbox" name="ok" value={key} defaultChecked className="size-5 accent-emerald-600" />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4">
          <OpsSubmit name="decision" value="approve" className="bg-emerald-600 text-white">
            ✓ APROBAR
          </OpsSubmit>
        </div>
        <details className="mt-4 rounded-2xl border border-red-200 p-3">
          <summary className="cursor-pointer text-base font-bold text-red-700">✕ Rechazar</summary>
          <label className="mt-3 block text-sm font-semibold">
            Motivo
            <select name="reason" defaultValue="" className="mt-1 h-12 w-full rounded-xl border bg-white px-3 text-sm">
              <option value="" disabled>
                Elige el motivo…
              </option>
              {rejectionReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <textarea name="notes" maxLength={1000} placeholder="Detalle (opcional)" className="mt-3 w-full rounded-xl border p-3 text-sm" />
          <div className="mt-3">
            <OpsSubmit name="decision" value="reject" className="bg-[#d03b3b] text-white" confirmMessage="¿Rechazar la limpieza? La habitación vuelve a aseo.">
              RECHAZAR Y DEVOLVER A ASEO
            </OpsSubmit>
          </div>
        </details>
      </form>
      <Link href={`/ops/report?room=${room.id}`} className="mt-4 flex h-12 items-center justify-center rounded-2xl text-sm font-bold text-[#d03b3b] ring-1 ring-red-200">
        REPORTAR PROBLEMA
      </Link>
    </>
  );
}
