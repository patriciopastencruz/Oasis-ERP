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
      "id,estimated_arrival,status,total_value,lodging_rooms(name),lodging_guests(full_name,phone),lodging_reservation_payments(amount,type,status)",
    )
    .eq("business_unit_id", unit.id)
    .eq("check_in", today)
    .neq("status", "cancelled");
  return (
    <>
      <PageHeader
        eyebrow="Hostal Uruguay"
        title="Llegadas de hoy"
        description="Huéspedes esperados, contacto, habitación y saldo."
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
                className="grid gap-2 rounded-xl border p-4 text-sm sm:grid-cols-5"
              >
                <b>{r.estimated_arrival?.slice(0, 5) || "Sin hora"}</b>
                <span>{g?.full_name || "Información pendiente"}</span>
                <span>{room?.name}</span>
                <span>{g?.phone || "Sin teléfono"}</span>
                <span className="sm:text-right">
                  Saldo {clp.format(Number(r.total_value) - paid)}
                </span>
              </Link>
            );
          })}
          {!data?.length && (
            <p className="text-sm text-slate-500">
              No hay llegadas programadas para hoy.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
