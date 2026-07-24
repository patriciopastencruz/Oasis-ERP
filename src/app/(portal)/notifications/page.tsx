import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "@/modules/platform/auth/application/session";
import {
  markOwnNotificationReadAction,
  markAllOwnNotificationsReadAction,
} from "@/modules/platform/auth/application/actions";
import { notificationActionPath } from "@/lib/notifications/approval-email-template";
export default async function Notifications() {
  const ctx = await requireSession();
  const s = await createSupabaseServerClient();
  const { data } = await s
    .from("notifications")
    .select("id,title,body,status,entity_type,entity_id,event_key,created_at")
    .eq("recipient_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader
        title="Notificaciones"
        description="Avisos internos de solicitudes y aprobaciones."
      />
      <form action={markAllOwnNotificationsReadAction} className="mb-4">
        <button className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
          Marcar todas como leídas
        </button>
      </form>
      <Panel>
        <div className="space-y-3">
          {data?.map((n) => {
            const href = notificationActionPath(
              n.entity_type ?? "",
              n.entity_id ?? "",
              n.event_key,
            );
            return (
              <div
                key={n.id}
                className={`flex flex-wrap justify-between gap-3 rounded-xl border p-4 ${n.status === "unread" ? "bg-amber-50" : "bg-white"}`}
              >
                <Link href={href}>
                  <b>{n.title}</b>
                  <p className="text-sm text-slate-600">{n.body}</p>
                  <small>
                    {new Date(n.created_at).toLocaleString("es-CL")}
                  </small>
                </Link>
                {n.status === "unread" && (
                  <form action={markOwnNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button className="text-sm font-semibold text-[#0b4f9c]">
                      Marcar leída
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        {!data?.length && (
          <p className="py-12 text-center text-sm text-slate-500">
            No tienes notificaciones.
          </p>
        )}
      </Panel>
    </>
  );
}
