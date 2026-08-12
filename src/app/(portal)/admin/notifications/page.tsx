import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/modules/platform/auth/application/session";

const STATUSES = ["pending", "sending", "sent", "failed"] as const;

export default async function NotificationsOutbox({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  await requirePermission("administration.users.manage");
  const { email } = await searchParams;
  const admin = createSupabaseAdminClient();

  // Lectura privilegiada: la cola de correos de aprobación solo es legible
  // por service_role (ver 20260714134220_approval_email_notifications.sql),
  // así que ningún usuario -ni superadmin- puede verla con su propia sesión.
  const counts = await Promise.all(
    STATUSES.map((status) =>
      admin
        .from("approval_email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .then((r) => [status, r.count ?? 0] as const),
    ),
  );

  let rowsQuery = admin
    .from("approval_email_outbox")
    .select(
      "id,recipient_email,event_key,subject,status,attempts,next_attempt_at,last_error,sent_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (email) rowsQuery = rowsQuery.ilike("recipient_email", `%${email}%`);
  const { data: rows } = await rowsQuery;

  return (
    <>
      <PageHeader
        title="Correos de aprobación"
        description="Estado de la cola de envío (approval_email_outbox). El cron de respaldo solo corre una vez al día; los reintentos normales ocurren cuando alguien más dispara una acción de aprobación en cualquier módulo."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map(([status, count]) => (
          <Panel key={status}>
            <p className="text-xs text-[#63778e]">{uiLabel(status)}</p>
            <p className="text-2xl font-bold">{count}</p>
          </Panel>
        ))}
      </div>
      <Panel className="mb-5">
        <form className="flex flex-wrap gap-2">
          <input
            name="email"
            defaultValue={email}
            placeholder="Filtrar por correo, ej. pamela@..."
            className="rounded-xl border bg-white px-4 py-2"
          />
          <button className="rounded-xl bg-[#083f7d] px-4 py-2 text-white">
            Filtrar
          </button>
        </form>
      </Panel>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-[#63778e]">
              <th className="py-2">Creado</th>
              <th>Destinatario</th>
              <th>Evento</th>
              <th>Estado</th>
              <th>Intentos</th>
              <th>Próximo intento</th>
              <th>Enviado</th>
              <th>Último error</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </td>
                <td>{r.recipient_email}</td>
                <td className="max-w-[220px]">
                  <p className="font-semibold">{r.event_key}</p>
                  <p className="text-xs text-[#63778e]">{r.subject}</p>
                </td>
                <td>{uiLabel(r.status)}</td>
                <td>{r.attempts}</td>
                <td className="whitespace-nowrap">
                  {new Date(r.next_attempt_at).toLocaleString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </td>
                <td className="whitespace-nowrap">
                  {r.sent_at
                    ? new Date(r.sent_at).toLocaleString("es-CL", {
                        timeZone: "America/Santiago",
                      })
                    : "—"}
                </td>
                <td className="max-w-[260px] text-xs text-red-700">
                  {r.last_error ?? "—"}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[#63778e]">
                  Sin registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
