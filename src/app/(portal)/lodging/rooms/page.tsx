import { PageHeader, Panel } from "@/components/ui/page";
import Link from "next/link";
import { ClpInput } from "@/components/lodging/clp-input";
import { lodgingContext } from "@/modules/lodging/application/queries";
import {
  createRoomAction,
  updateRoomAction,
} from "@/modules/lodging/application/actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, company, supabase } = await lodgingContext();
  const { data: rooms } = await supabase
    .from("lodging_rooms")
    .select("*")
    .eq("business_unit_id", unit.id)
    .order("display_order");
  const can = ctx.permissions.has("lodging.rooms.manage"),
    field = "rounded-xl border px-3 py-2 text-sm";
  const selectedRoom = (rooms ?? []).find((room) => room.id === q.room);
  return (
    <>
      <PageHeader
        eyebrow="Hostal Uruguay"
        title="Habitaciones"
        description="Las habitaciones activas aparecen automáticamente en el calendario. Desactivar una habitación conserva todo su historial."
      />
      {(q.success || q.error) && (
        <p
          className={`mb-4 rounded-xl p-3 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {q.error || q.success}
        </p>
      )}
      <Panel>
        <form className="flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm">
            Selecciona una habitación
            <select
              name="room"
              defaultValue={q.room ?? ""}
              className={`mt-1 w-full ${field}`}
            >
              <option value="">Selecciona</option>
              {(rooms ?? []).map((room) => (
                <option value={room.id} key={room.id}>
                  {room.name} · {room.active ? "Activa" : "Inactiva"}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-xl bg-[#173f2d] px-5 py-2 text-sm font-semibold text-white">
            Editar habitación
          </button>
        </form>
      </Panel>
      {selectedRoom ? (
        <Panel className="mt-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Editar {selectedRoom.name}</h2>
              <p className="text-xs text-slate-500">
                Código {selectedRoom.code}
              </p>
            </div>
            <Link
              href="/lodging/rooms"
              className="text-sm font-semibold text-[#277a55]"
            >
              Cerrar edición
            </Link>
          </div>
          <form action={updateRoomAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="room_id" value={selectedRoom.id} />
            <label className="text-sm">
              Nombre
              <input
                name="name"
                defaultValue={selectedRoom.name}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              />
            </label>
            <label className="text-sm">
              Capacidad
              <input
                name="capacity"
                type="number"
                min="1"
                defaultValue={selectedRoom.capacity}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              />
            </label>
            <label className="text-sm">
              Tarifa base en pesos chilenos
              <ClpInput
                name="base_rate"
                defaultValue={selectedRoom.base_rate}
                disabled={!can}
                className={field}
              />
            </label>
            <label className="text-sm">
              Estado
              <select
                name="status"
                defaultValue={selectedRoom.status}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              >
                <option value="available">Disponible</option>
                <option value="occupied">Ocupada</option>
                <option value="cleaning">Limpieza</option>
                <option value="maintenance">Mantención</option>
                <option value="out_of_service">Fuera de servicio</option>
              </select>
            </label>
            <label className="text-sm">
              Orden
              <input
                name="display_order"
                type="number"
                min="0"
                defaultValue={selectedRoom.display_order}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              />
            </label>
            <label className="text-sm">
              Activa
              <select
                name="active"
                defaultValue={String(selectedRoom.active)}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Descripción
              <input
                name="description"
                defaultValue={selectedRoom.description ?? ""}
                disabled={!can}
                className={`mt-1 w-full ${field}`}
              />
            </label>
            {can && (
              <>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  La nueva tarifa se aplicará solo a futuras reservas directas.
                  No modificará reservas ya confirmadas ni los precios
                  publicados en Booking o Airbnb.
                </p>
                <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">
                  Guardar cambios
                </button>
              </>
            )}
          </form>
        </Panel>
      ) : (
        <Panel className="mt-4">
          <p className="text-sm text-slate-600">
            Selecciona una habitación para consultar y editar su configuración.
          </p>
        </Panel>
      )}
      {can && (
        <Panel className="mt-4">
          <h2 className="font-semibold">Agregar habitación</h2>
          <form
            action={createRoomAction}
            className="mt-4 grid gap-3 md:grid-cols-4"
          >
            <input type="hidden" name="company_id" value={company.id} />
            <input type="hidden" name="business_unit_id" value={unit.id} />
            <input
              name="code"
              required
              placeholder="Código"
              className={field}
            />
            <input
              name="name"
              required
              placeholder="Nombre"
              className={field}
            />
            <input
              name="capacity"
              type="number"
              min="1"
              defaultValue="2"
              className={field}
            />
            <ClpInput name="base_rate" defaultValue="35000" className={field} />
            <input
              name="description"
              placeholder="Descripción"
              className={field}
            />
            <input
              name="display_order"
              type="number"
              min="0"
              defaultValue={(rooms?.length ?? 0) + 1}
              className={field}
            />
            <button className="rounded-xl bg-[#277a55] px-4 py-2 text-sm font-semibold text-white md:col-span-2">
              Crear habitación
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
