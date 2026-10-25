import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { LiveRefresh } from "@/components/kpis/live-refresh";
import {
  confirmBookingAction,
  markReviewedAction,
  rejectBookingAction,
  releaseControlAction,
  sendReplyAction,
} from "@/modules/lucia/application/actions";
import { bookingStatusLabels, loadConversation, loadHostels, luciaContext } from "@/modules/lucia/application/queries";
import { bubbleTime, daySeparator } from "@/modules/lucia/chat-ui";
import { formatClp } from "@/modules/lucia/ui";

export const dynamic = "force-dynamic";

const MEDIA: Record<string, string> = {
  image: "📷 Foto",
  audio: "🎤 Audio",
  video: "🎥 Video",
  document: "📄 Documento",
  sticker: "Sticker",
  location: "📍 Ubicación",
  contact: "👤 Contacto",
};
const TICKS: Record<string, string> = { queued: "🕓", sending: "🕓", sent: "✓✓", failed: "⚠️ No se envió" };

type Person = { first_name?: string } | null;

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { ctx, supabase, settings } = await luciaContext("lucia.inbox.view");
  const [{ conversation: c, messages }, hostels] = await Promise.all([loadConversation(supabase, id), loadHostels(supabase)]);
  if (!c || c.channel === "simulator") notFound();
  const canReply = ctx.permissions.has("lucia.inbox.reply");
  const name = c.guest_name || c.contact_name || c.contact_phone || "Cliente";
  const hostel = c.hostel_assigned ? hostels.find((h) => h.business_unit_id === c.business_unit_id)?.display_name : null;
  const paused = c.status === "human" || (c.paused_until && new Date(c.paused_until) > new Date());
  const self = `/chats/${c.id}`;
  const hidden = (
    <>
      <input type="hidden" name="conversation_id" value={c.id} />
      <input type="hidden" name="return_to" value={self} />
    </>
  );

  // Las burbujas van de abajo hacia arriba (flex-col-reverse): el chat abre en el último mensaje.
  const items: { key: string; node: React.ReactNode }[] = [];
  let lastDay = "";
  // Las respuestas que Lucía descartó porque el cliente escribió otra vez
  // nunca le llegaron: no se muestran para no confundir al equipo.
  for (const m of messages.filter((m) => !(m.delivery_status === "failed" && m.error_message?.startsWith("Respuesta omitida")))) {
    const day = daySeparator(m.created_at);
    if (day !== lastDay) {
      items.push({
        key: `d-${m.id}`,
        node: (
          <p className="mx-auto my-1 rounded-lg bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm">
            {day}
          </p>
        ),
      });
      lastDay = day;
    }
    const mine = m.direction === "outbound";
    const sender = (Array.isArray(m.sender) ? m.sender[0] : m.sender) as Person;
    items.push({
      key: m.id,
      node: (
        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[82%] rounded-xl px-3 py-1.5 text-[15px] shadow-sm ${mine ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"}`}>
            {mine && (
              <p className="text-[11px] font-semibold text-emerald-700">
                {m.sender_type === "lucia" ? settings.agent_name : m.sender_type === "human" ? sender?.first_name ?? "Equipo" : "Sistema"}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words">{m.message_type === "text" ? m.content : MEDIA[m.message_type] ?? "Mensaje"}</p>
            <p className="mt-0.5 text-right text-[10px] text-slate-400">
              {bubbleTime(m.created_at)}
              {mine && ` ${TICKS[m.delivery_status] ?? ""}`}
            </p>
          </div>
        </div>
      ),
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="flex items-center gap-3 bg-[#075e54] px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))] text-white">
        <Link href="/chats" aria-label="Volver a los chats" className="grid size-9 place-items-center rounded-full active:bg-white/10">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="truncate text-xs text-emerald-100">
            {[c.contact_phone, hostel ?? "Sin hostal asignada"].filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* Actualiza el chat cada 20 s; oculto para no tapar el nombre en el celular. */}
        <div className="hidden">
          <LiveRefresh generatedAt={new Date().toISOString()} intervalSeconds={20} />
        </div>
      </header>

      {(q.success || q.error) && (
        <p className={`px-4 py-2 text-sm ${q.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{q.error ?? q.success}</p>
      )}

      {c.needs_review && (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">🔔 {c.review_reason ?? "Lucía pidió ayuda con este chat."}</span>
          {canReply && (
            <form action={markReviewedAction}>
              {hidden}
              <button className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold">Resuelto</button>
            </form>
          )}
        </div>
      )}

      {c.booking_status !== "none" && (
        <div className="space-y-2 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          <p>
            🛏️ <b>{bookingStatusLabels[c.booking_status] ?? c.booking_status}</b>
            {c.booking_code ? ` · código ${c.booking_code}` : ""}
            {c.quoted_amount ? ` · ${formatClp(c.quoted_amount)}` : ""}
            {c.check_in && c.check_out ? ` · ${c.check_in.split("-").reverse().join("-")} al ${c.check_out.split("-").reverse().join("-")}` : ""}
          </p>
          {canReply && c.booking_status === "awaiting_reception" && (
            <div className="flex flex-wrap gap-2">
              <form action={confirmBookingAction}>
                {hidden}
                <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Sí hay disponibilidad</button>
              </form>
              <form action={rejectBookingAction}>
                {hidden}
                <button className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold">No hay disponibilidad</button>
              </form>
            </div>
          )}
          {["awaiting_payment", "proof_received"].includes(c.booking_status) && (
            <Link href={`/lodging/lucia/${c.id}`} className="inline-block text-xs font-semibold text-[var(--oasis-primary)] underline">
              Verificar el pago en el ERP
            </Link>
          )}
        </div>
      )}

      <main className="flex flex-1 flex-col-reverse gap-1.5 overflow-y-auto px-3 py-3">
        {items.length === 0 && <p className="mx-auto text-sm text-slate-500">Aún no hay mensajes.</p>}
        {[...items].reverse().map((i) => (
          <div key={i.key} className="flex flex-col">{i.node}</div>
        ))}
      </main>

      {canReply && c.status !== "closed" ? (
        <footer className="bg-[#f0f2f5] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
          {paused && (
            <form action={releaseControlAction} className="mb-2 flex items-center gap-2 text-xs text-slate-600">
              {hidden}
              <span className="min-w-0 flex-1">{settings.agent_name} está en pausa en este chat: responde el equipo.</span>
              <button className="rounded-lg border bg-white px-2 py-1 font-semibold">Devolver a {settings.agent_name}</button>
            </form>
          )}
          <form action={sendReplyAction} className="flex items-end gap-2">
            {hidden}
            <textarea
              name="content"
              rows={1}
              required
              maxLength={4000}
              placeholder="Escribe un mensaje"
              aria-label="Mensaje para el cliente"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-2.5 text-[15px] shadow-sm outline-none [field-sizing:content] focus:ring-2 focus:ring-emerald-500"
            />
            <button aria-label="Enviar" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white">
              <Send size={18} />
            </button>
          </form>
          {!paused && (
            <p className="mt-1 px-2 text-[11px] text-slate-500">
              Al responder, {settings.agent_name} se pausa 12 horas en este chat para no contestar encima tuyo.
            </p>
          )}
        </footer>
      ) : (
        <footer className="bg-[#f0f2f5] px-4 py-3 text-center text-xs text-slate-500">
          {c.status === "closed" ? "Conversación cerrada." : "Solo lectura: no tienes permiso para responder."}
        </footer>
      )}
    </div>
  );
}
