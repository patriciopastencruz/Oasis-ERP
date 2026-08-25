import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { paymentSummary } from "@/modules/lodging/domain/reservations";
import { clp } from "@/modules/lodging/application/queries";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 90;

function todayInSantiago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string, todayIso: string, tomorrowIso: string) {
  const formatted = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  if (iso === todayIso) return `Hoy · ${capitalized}`;
  if (iso === tomorrowIso) return `Mañana · ${capitalized}`;
  return capitalized;
}

const originLabels: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking",
  direct: "Directa",
  whatsapp: "WhatsApp",
  company: "Empresa",
  public_web: "Sitio web",
  other: "Otro",
  maintenance: "Mantención",
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();

  const db = createSupabaseAdminClient();
  const { data: link } = await db
    .from("lodging_family_calendar_links")
    .select("id,business_unit_id,label")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  if (!link) notFound();

  db.from("lodging_family_calendar_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(() => {}, () => {});

  const { data: unit } = await db
    .from("business_units")
    .select("name")
    .eq("id", link.business_unit_id)
    .maybeSingle();

  const todayIso = todayInSantiago();
  const tomorrowIso = addDays(todayIso, 1);
  const rangeEnd = addDays(todayIso, DAYS_AHEAD);

  const { data: reservations } = await db
    .from("lodging_reservations")
    .select(
      "id,check_in,check_out,estimated_arrival,total_value,origin,raw_summary,lodging_rooms(name,display_order),lodging_guests(full_name),lodging_reservation_payments(amount,type,status)",
    )
    .eq("business_unit_id", link.business_unit_id)
    // No solo quién llega cada día: también quién ya está alojado y sigue
    // ocupando la pieza (check_in pudo ser antes de hoy). Mismo criterio de
    // "ocupado" que el resto del sistema: [check_in, check_out).
    .lt("check_in", rangeEnd)
    .gt("check_out", todayIso)
    .not("status", "in", '("cancelled","conflict")')
    .order("check_in");

  type Reservation = NonNullable<typeof reservations>[number];
  const byDay = new Map<string, { reservation: Reservation; isArrivalDay: boolean }[]>();
  for (const r of reservations ?? []) {
    let day = r.check_in < todayIso ? todayIso : r.check_in;
    while (day < r.check_out && day < rangeEnd) {
      const list = byDay.get(day) ?? [];
      list.push({ reservation: r, isArrivalDay: day === r.check_in });
      byDay.set(day, list);
      day = addDays(day, 1);
    }
  }
  const days = [...byDay.keys()].sort();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px" }}>
      <meta httpEquiv="refresh" content="300" />
      <header style={{ textAlign: "center", marginBottom: 32 }}>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#0b4f9c",
            textTransform: "uppercase",
          }}
        >
          {unit?.name ?? "Reservas"}
        </p>
        <h1
          style={{
            margin: "8px 0 0",
            fontSize: 34,
            lineHeight: 1.15,
            fontFamily: "var(--font-playfair), serif",
            color: "#1c2b3a",
          }}
        >
          Calendario de reservas
        </h1>
        {link.label && (
          <p style={{ margin: "10px 0 0", fontSize: 17, color: "#5a6b7d" }}>
            Vista de {link.label}
          </p>
        )}
      </header>

      {days.length === 0 && (
        <p
          style={{
            textAlign: "center",
            fontSize: 20,
            color: "#5a6b7d",
            marginTop: 60,
          }}
        >
          No hay reservas próximas por ahora.
        </p>
      )}

      {days.map((day) => {
        const list = [...(byDay.get(day) ?? [])].sort((a, b) => {
          const ra = Array.isArray(a.reservation.lodging_rooms)
            ? a.reservation.lodging_rooms[0]
            : a.reservation.lodging_rooms;
          const rb = Array.isArray(b.reservation.lodging_rooms)
            ? b.reservation.lodging_rooms[0]
            : b.reservation.lodging_rooms;
          return (ra?.display_order ?? 0) - (rb?.display_order ?? 0);
        });
        const isToday = day === todayIso;
        return (
          <section key={day} style={{ marginBottom: 28 }}>
            <h2
              style={{
                margin: "0 0 12px",
                fontSize: isToday ? 26 : 22,
                fontWeight: 800,
                color: isToday ? "#0b4f9c" : "#1c2b3a",
                borderBottom: `3px solid ${isToday ? "#0b4f9c" : "#dbe4ee"}`,
                paddingBottom: 8,
              }}
            >
              {dayLabel(day, todayIso, tomorrowIso)}
            </h2>
            <div style={{ display: "grid", gap: 14 }}>
              {list.map(({ reservation: r, isArrivalDay }) => {
                const room = Array.isArray(r.lodging_rooms) ? r.lodging_rooms[0] : r.lodging_rooms;
                const guest = Array.isArray(r.lodging_guests) ? r.lodging_guests[0] : r.lodging_guests;
                const name =
                  guest?.full_name?.trim() ||
                  (r.raw_summary?.trim() ?? "") ||
                  `Huésped ${originLabels[r.origin] ?? r.origin}`;
                const balance = paymentSummary(
                  Number(r.total_value),
                  (r.lodging_reservation_payments ?? []).map((p) => ({
                    amount: Number(p.amount),
                    type: p.type as never,
                    status: p.status as never,
                  })),
                ).balance;
                return (
                  <article
                    key={`${r.id}-${day}`}
                    style={{
                      background: "#fff",
                      border: "1px solid #dbe4ee",
                      borderRadius: 16,
                      padding: "18px 20px",
                      boxShadow: "0 1px 3px rgba(15,35,57,0.06)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 21, fontWeight: 800, color: "#1c2b3a" }}>
                        {room?.name ?? "Habitación"}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: isArrivalDay ? "#1f8a4c" : "#5a6b7d",
                            background: isArrivalDay ? "#e6f5ec" : "#eef1f5",
                            borderRadius: 999,
                            padding: "4px 12px",
                          }}
                        >
                          {isArrivalDay ? "Llega hoy" : "Alojando"}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#0b4f9c",
                            background: "#e8f0fb",
                            borderRadius: 999,
                            padding: "4px 12px",
                          }}
                        >
                          {originLabels[r.origin] ?? r.origin}
                        </span>
                      </div>
                    </div>
                    <p style={{ margin: "10px 0 0", fontSize: 19, color: "#2e3946" }}>
                      {name}
                    </p>
                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>
                        {isArrivalDay ? (
                          <>
                            🕒 Llegada:{" "}
                            <b>{r.estimated_arrival?.slice(0, 5) || "Sin hora"}</b>
                          </>
                        ) : (
                          <>🏠 Alojado desde el {new Intl.DateTimeFormat("es-CL", {
                            timeZone: "America/Santiago",
                            day: "numeric",
                            month: "long",
                          }).format(new Date(`${r.check_in}T12:00:00Z`))}</>
                        )}
                      </span>
                      <span style={{ fontSize: 18 }}>
                        💵 A cobrar:{" "}
                        <b style={{ color: balance > 0 ? "#b3541e" : "#1f8a4c" }}>
                          {balance > 0 ? clp.format(balance) : "Pagado"}
                        </b>
                      </span>
                    </div>
                    <p style={{ margin: "10px 0 0", fontSize: 15, color: "#7d8ea1" }}>
                      Salida: {new Intl.DateTimeFormat("es-CL", {
                        timeZone: "America/Santiago",
                        day: "numeric",
                        month: "long",
                      }).format(new Date(`${r.check_out}T12:00:00Z`))}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <p style={{ textAlign: "center", fontSize: 14, color: "#9aa9ba", marginTop: 40 }}>
        Esta página se actualiza sola. Si no ves los últimos cambios, ciérrala y ábrela de nuevo.
      </p>
    </div>
  );
}
