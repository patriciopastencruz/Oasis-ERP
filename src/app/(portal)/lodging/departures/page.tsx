import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { lodgingContext, clp } from "@/modules/lodging/application/queries";
export default async function Page() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const { unit, supabase } = await lodgingContext();
  const { data } = await supabase
    .from("lodging_reservations")
    .select(
      "id,status,total_value,lodging_rooms(name,status),lodging_guests(full_name),lodging_reservation_payments(amount,type,status)",
    )
    .eq("business_unit_id", unit.id)
    .eq("check_out", today)
    .neq("status", "cancelled");
  return (
    <>
      <PageHeader
        eyebrow="Hostal Uruguay"
        title="Salidas de hoy"
        description="Control de saldo, check-out y limpieza de habitaciones."
      />
      <Panel>
        <div className="space-y-3">
          {(data ?? []).map((r) => {
            const g = Array.isArray(r.lodging_guests)
                ? r.lodging_guests[0]
                : r.lodging_guests,
              room = Array.isArray(r.lodging_rooms)
                ? r.lodging_rooms[0]
                : r.lodging_rooms;
            const paid = (r.lodging_reservation_payments ?? [])
              .filter((p) => p.status === "confirmed")
              .reduce(
                (n, p) =>
                  n +
                  (p.type === "refund" ? -Number(p.amount) : Number(p.amount)),
                0,
              );
            return (
              <Link
                key={r.id}
                href={`/lodging/reservations/${r.id}`}
                className="grid gap-2 rounded-xl border p-4 text-sm sm:grid-cols-4"
              >
                <b>{g?.full_name || "Información pendiente"}</b>
                <span>{room?.name}</span>
                <span>Saldo {clp.format(Number(r.total_value) - paid)}</span>
                <span className="capitalize sm:text-right">
                  {r.status.replaceAll("_", " ")} · {room?.status}
                </span>
              </Link>
            );
          })}
          {!data?.length && (
            <p className="text-sm text-slate-500">
              No hay salidas programadas para hoy.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
