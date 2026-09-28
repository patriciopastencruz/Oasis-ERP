import Link from "next/link";
import { redirect } from "next/navigation";
import { Elapsed } from "@/components/ops/elapsed";
import { OpsSubmit } from "@/components/ops/ops-submit";
import { loadBoard, opsContext } from "@/modules/lodging/application/ops-queries";
import { finishCleaningAction } from "@/modules/lodging/application/ops-actions";
import { arrivalLabel, housekeepingChecklist } from "@/modules/lodging/domain/operations";

/** Finalizar limpieza: TODO OK en un toque, o desmarcar solo lo que tiene problema. */
export default async function CleanPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ taskId }, q] = await Promise.all([params, searchParams]);
  const { unit, supabase, can } = await opsContext();
  if (!can.clean) redirect("/ops");
  const board = await loadBoard(supabase, unit.id);
  const room = board.rooms.find((r) => r.task?.id === taskId && r.task.status === "in_progress");
  if (!room) redirect("/ops?error=" + encodeURIComponent("Esta limpieza ya no está en curso."));
  return (
    <>
      <Link href="/ops" className="mb-3 inline-block text-sm font-semibold text-[#0b4f9c]">
        ← Volver
      </Link>
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">{room.name}</h1>
        <p className="mt-1 text-sm font-semibold text-amber-800">◐ En limpieza · {room.task?.started_at && <Elapsed since={room.task.started_at} />}</p>
        <p className="mt-1 text-sm text-slate-600">Próximo check-in: {arrivalLabel(room, board.today)}</p>
        {room.rework && room.last_rejection && <p className="mt-1 text-sm font-semibold text-red-700">Rechazada antes por: {room.last_rejection.reason}</p>}
      </div>
      {q.error && <p className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{q.error}</p>}
      <form action={finishCleaningAction}>
        <input type="hidden" name="task_id" value={taskId} />
        <OpsSubmit name="all_ok" value="1" className="bg-emerald-600 text-white">
          ✓ TODO OK · FINALIZAR
        </OpsSubmit>
        <details className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-base font-bold text-slate-700">Hay algo con problema</summary>
          <p className="mt-2 text-sm text-slate-500">Desmarca solo lo que quedó con problema.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {housekeepingChecklist.map(([key, label]) => (
              <label key={key} className="flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50">
                <input type="checkbox" name="ok" value={key} defaultChecked className="size-5 accent-emerald-600" />
                {label}
              </label>
            ))}
          </div>
          <textarea name="notes" maxLength={1000} placeholder="Comentario (opcional)" className="mt-3 w-full rounded-xl border p-3 text-sm" />
          <div className="mt-3">
            <OpsSubmit className="bg-amber-500 text-white">FINALIZAR CON OBSERVACIONES</OpsSubmit>
          </div>
        </details>
      </form>
      <Link href={`/ops/report?room=${room.id}`} className="mt-4 flex h-12 items-center justify-center rounded-2xl text-sm font-bold text-[#d03b3b] ring-1 ring-red-200">
        REPORTAR PROBLEMA
      </Link>
    </>
  );
}
