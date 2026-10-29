import Link from "next/link";
import { CircleHelp, LogOut } from "lucide-react";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { loadHostels, loadInbox, luciaContext } from "@/modules/lucia/application/queries";
import { needsAttention, previewText, chatTime } from "@/modules/lucia/chat-ui";

export const dynamic = "force-dynamic";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const q = await searchParams;
  const { supabase, settings } = await luciaContext("lucia.inbox.view");
  const [rows, hostels] = await Promise.all([loadInbox(supabase, { view: "activos", channel: "whatsapp" }), loadHostels(supabase)]);
  const ids = rows.map((r) => r.id);
  const { data: recent } = ids.length
    ? await supabase
        .from("lucia_messages")
        .select("conversation_id,direction,sender_type,message_type,content,created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(600)
    : { data: [] };
  const lastOf = new Map<string, NonNullable<typeof recent>[number]>();
  for (const m of recent ?? []) if (!lastOf.has(m.conversation_id)) lastOf.set(m.conversation_id, m);
  const hostelName = new Map(hostels.map((h) => [h.business_unit_id, h.display_name.replace(/^(Hostal|Hospedaje)\s+/i, "")]));

  const pending = rows.filter((r) => needsAttention(r));
  const showAll = q.ver === "todos";
  const list = showAll ? rows : pending;

  return (
    <>
      <header className="sticky top-0 z-10 bg-[#075e54] px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">Chats de {settings.agent_name}</h1>
            <p className="text-xs text-emerald-100">Conversaciones del WhatsApp de las hostales</p>
          </div>
          <Link href="/chats/manual" aria-label="Manual de uso" className="grid size-9 place-items-center rounded-full bg-white/10">
            <CircleHelp size={18} />
          </Link>
          <form action={logoutAction}>
            <button aria-label="Cerrar sesión" className="grid size-9 place-items-center rounded-full bg-white/10">
              <LogOut size={16} />
            </button>
          </form>
        </div>
        <nav className="mt-3 flex gap-2 text-sm font-semibold">
          <Link href="/chats" className={`rounded-full px-3 py-1 ${!showAll ? "bg-white text-[#075e54]" : "bg-white/10"}`}>
            Por atender{pending.length ? ` (${pending.length})` : ""}
          </Link>
          <Link href="/chats?ver=todos" className={`rounded-full px-3 py-1 ${showAll ? "bg-white text-[#075e54]" : "bg-white/10"}`}>
            Todos
          </Link>
        </nav>
      </header>

      <ul className="flex-1 divide-y bg-white">
        {list.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-500">
            {showAll ? "Todavía no hay conversaciones." : "No hay chats por atender. 👍 Lucía está al día."}
          </li>
        )}
        {list.map((c) => {
          const last = lastOf.get(c.id);
          const name = c.guest_name || c.contact_name || c.contact_phone || "Cliente";
          const attention = needsAttention(c);
          return (
            <li key={c.id}>
              <Link href={`/chats/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800">
                  {name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 flex-1 truncate">{name}</b>
                    <span className={`shrink-0 text-[11px] ${attention ? "font-semibold text-emerald-600" : "text-slate-400"}`}>
                      {chatTime(c.last_message_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{previewText(last)}</span>
                    {attention && <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" aria-label="Por atender" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {c.hostel_assigned ? hostelName.get(c.business_unit_id) ?? "Hostal" : "Sin hostal asignada"}
                    {attention && c.review_reason ? ` · ${c.review_reason}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-center bg-white py-3">
        <LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={60} />
      </div>
    </>
  );
}
