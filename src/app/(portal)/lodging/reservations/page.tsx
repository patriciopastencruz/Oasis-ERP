import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import {
  lodgingContext,
  formatDate,
  clp,
} from "@/modules/lodging/application/queries";
export default async function Page() {
  const { unit, supabase } = await lodgingContext();
  const { data } = await supabase
    .from("lodging_reservations")
    .select(
      "id,origin,status,check_in,check_out,total_value,information_complete,lodging_rooms(name),lodging_guests(full_name)",
    )
    .eq("business_unit_id", unit.id)
    .order("check_in", { ascending: false })
    .limit(100);
  return (
    <>
      <div className="flex justify-between gap-4">
        <PageHeader
          eyebrow={unit.name}
          title="Reservas"
          description="Reservas directas e importadas, con información operativa centralizada."
        />
        <Link
          href="/lodging/reservations/new"
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-[#277a55] px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} />
          Nueva reserva
        </Link>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="pb-3">Huésped</th>
              <th>Habitación</th>
              <th>Estadía</th>
              <th>Origen</th>
              <th>Estado</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r) => {
              const guest = Array.isArray(r.lodging_guests)
                ? r.lodging_guests[0]
                : r.lodging_guests;
              const room = Array.isArray(r.lodging_rooms)
                ? r.lodging_rooms[0]
                : r.lodging_rooms;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-3">
                    <Link
                      href={`/lodging/reservations/${r.id}`}
                      className="font-semibold text-[#1c6748]"
                    >
                      {guest?.full_name ||
                        `Reserva ${r.origin} — información pendiente`}
                    </Link>
                  </td>
                  <td>{room?.name}</td>
                  <td>
                    {formatDate(r.check_in)} → {formatDate(r.check_out)}
                  </td>
                  <td className="capitalize">{r.origin}</td>
                  <td
                    className={
                      r.status === "conflict"
                        ? "font-semibold text-red-600"
                        : "capitalize"
                    }
                  >
                    {uiLabel(r.status)}
                  </td>
                  <td className="text-right">
                    {clp.format(Number(r.total_value))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
