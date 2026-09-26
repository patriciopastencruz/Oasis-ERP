import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";

type Payment = { amount: number; type: string; status: string };
const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] : value);
const paidOf = (payments: Payment[] | null) =>
  (payments ?? [])
    .filter((p) => p.status === "confirmed")
    .reduce((n, p) => n + (p.type === "refund" ? -Number(p.amount) : Number(p.amount)), 0);

/** Llegadas y salidas del día en una sola vista. */
export default async function Page() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const { unit, supabase } = await lodgingContext();
  const [{ data: arrivals }, { data: departures }] = await Promise.all([
    supabase
      .from("lodging_reservations")
      .select(
        "id,estimated_arrival,status,total_value,lodging_rooms(name),lodging_guests(full_name,phone),lodging_reservation_payments(amount,type,status)",
      )
      .eq("business_unit_id", unit.id)
      .eq("check_in", today)
      .neq("status", "cancelled")
      .order("estimated_arrival", { nullsFirst: false }),
    supabase
      .from("lodging_reservations")
      .select(
        "id,status,total_value,lodging_rooms(name,status),lodging_guests(full_name),lodging_reservation_payments(amount,type,status)",
      )
      .eq("business_unit_id", unit.id)
      .eq("check_out", today)
      .neq("status", "cancelled"),
  ]);

  const heading = (icon: React.ReactNode, title: string, count: number) => (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="font-semibold">{title}</h2>
      <span className="ml-auto rounded-full bg-[#edf4fc] px-2.5 py-0.5 text-xs font-semibold text-[#0b4f9c]">
        {count}
      </span>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={unit.name}
        title="Llegadas/Salidas"
        description="Huéspedes que llegan y salen hoy: contacto, habitación, saldo, check-out y limpieza."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          {heading(<LogIn size={18} className="text-[#0b4f9c]" />, "Llegadas de hoy", arrivals?.length ?? 0)}
          <div className="space-y-3">
            {(arrivals ?? []).map((r) => {
              const g = one(r.lodging_guests),
                room = one(r.lodging_rooms);
              return (
                <Link
                  key={r.id}
                  href={`/lodging/reservations/${r.id}`}
                  className="grid gap-1 rounded-xl border p-4 text-sm sm:grid-cols-[70px_1fr_auto] sm:gap-3"
                >
                  <b>{r.estimated_arrival?.slice(0, 5) || "Sin hora"}</b>
                  <span>
                    <span className="block font-medium">{g?.full_name || "Información pendiente"}</span>
                    <span className="text-slate-500">
                      {room?.name} · {g?.phone || "Sin teléfono"}
                    </span>
                  </span>
                  <span className="sm:text-right">
                    Saldo {clp.format(Number(r.total_value) - paidOf(r.lodging_reservation_payments))}
                  </span>
                </Link>
              );
            })}
            {!arrivals?.length && <p className="text-sm text-slate-500">No hay llegadas programadas para hoy.</p>}
          </div>
        </Panel>

        <Panel>
          {heading(<LogOut size={18} className="text-[#0b4f9c]" />, "Salidas de hoy", departures?.length ?? 0)}
          <div className="space-y-3">
            {(departures ?? []).map((r) => {
              const g = one(r.lodging_guests),
                room = one(r.lodging_rooms);
              return (
                <Link
                  key={r.id}
                  href={`/lodging/reservations/${r.id}`}
                  className="grid gap-1 rounded-xl border p-4 text-sm sm:grid-cols-[1fr_auto] sm:gap-3"
                >
                  <span>
                    <span className="block font-medium">{g?.full_name || "Información pendiente"}</span>
                    <span className="text-slate-500">
                      {room?.name} · Saldo {clp.format(Number(r.total_value) - paidOf(r.lodging_reservation_payments))}
                    </span>
                  </span>
                  <span className="capitalize sm:text-right">
                    {uiLabel(r.status)} · {uiLabel(room?.status)}
                  </span>
                </Link>
              );
            })}
            {!departures?.length && <p className="text-sm text-slate-500">No hay salidas programadas para hoy.</p>}
          </div>
        </Panel>
      </div>
    </>
  );
}
