import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/page";
import { StatusBadge } from "@/components/finance/status-badge";
import { uiLabel } from "@/lib/ui-labels";
import { ConversationTabs, Notice, inputClass } from "@/modules/whatsapp/ui";
import {
  conversationDetailContext,
  listUnitSellers,
  loadConversation,
  loadLead,
  loadMessages,
} from "@/modules/whatsapp/application/queries";
import { updateLeadAction } from "@/modules/whatsapp/application/actions";
import { ReplyForm } from "@/components/whatsapp/reply-form";
import { ConversationActions } from "@/components/whatsapp/conversation-actions";
import { productInterests, leadStatuses } from "@/modules/whatsapp/domain/lead";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
}

const SENDER_LABELS: Record<string, string> = {
  customer: "Cliente",
  ai: "IA",
  human: "Vendedor",
  system: "Sistema",
};

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const tab = q.tab || "conversacion";
  const { ctx, company, unit, supabase } = await conversationDetailContext();

  const conversation = await loadConversation(supabase, id);
  if (!conversation) notFound();

  const [messages, lead, unitMembers] = await Promise.all([
    loadMessages(supabase, id),
    loadLead(supabase, conversation.lead_id),
    listUnitSellers(supabase, company.id, unit.id),
  ]);

  const permissions = {
    canReply: ctx.permissions.has("whatsapp.inbox.reply"),
    canControlAgent: ctx.permissions.has("whatsapp.agent.control"),
    canAssign: ctx.permissions.has("whatsapp.conversations.assign"),
    canManageLead: ctx.permissions.has("whatsapp.leads.manage"),
  };
  const canRespondManually =
    permissions.canReply && conversation.status === "human_active";

  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title={lead?.full_name || "Conversación de WhatsApp"}
        description={`${lead?.phone_e164 ?? ""} ${lead?.city ? `· ${lead.city}` : ""}`.trim()}
      />
      <ConversationTabs conversationId={id} active={tab} />
      <Notice success={q.success} error={q.error} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge value={conversation.status} />
        {conversation.assigned && (
          <span className="text-xs text-[#63778e]">
            Responsable: {conversation.assigned.first_name} {conversation.assigned.last_name}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {tab === "conversacion" && (
            <Panel className="flex flex-col gap-4">
              <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === "inbound"
                        ? "self-start bg-[#f3f5f7]"
                        : m.sender_type === "system"
                          ? "self-end bg-slate-100 text-slate-600"
                          : "self-end bg-[var(--oasis-primary)] text-white"
                    }`}
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
                      {SENDER_LABELS[m.sender_type] ?? m.sender_type} ·{" "}
                      {formatDateTime(m.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.content || "(sin texto)"}</p>
                    {m.delivery_status === "failed" && (
                      <p className="mt-1 text-[10px] font-semibold text-red-200">
                        No se pudo entregar
                      </p>
                    )}
                  </div>
                ))}
                {!messages.length && (
                  <p className="p-4 text-center text-sm text-[#63778e]">
                    Todavía no hay mensajes.
                  </p>
                )}
              </div>
              <ReplyForm conversationId={id} disabled={!canRespondManually} />
            </Panel>
          )}

          {tab === "lead" && lead && (
            <Panel>
              <form action={updateLeadAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="conversation_id" value={id} />
                <label className="text-sm font-medium">
                  Nombre
                  <input
                    className={inputClass}
                    name="full_name"
                    defaultValue={lead.full_name ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Ciudad
                  <input
                    className={inputClass}
                    name="city"
                    defaultValue={lead.city ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Producto de interés
                  <select
                    className={inputClass}
                    name="product_interest"
                    defaultValue={lead.product_interest ?? ""}
                    disabled={!permissions.canManageLead}
                  >
                    <option value="">Sin definir</option>
                    {productInterests.map((p) => (
                      <option key={p} value={p}>
                        {uiLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Estado comercial
                  <select
                    className={inputClass}
                    name="status"
                    defaultValue={lead.status}
                    disabled={!permissions.canManageLead}
                  >
                    {leadStatuses.map((s) => (
                      <option key={s} value={s}>
                        {uiLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Dormitorios
                  <input
                    className={inputClass}
                    name="bedrooms"
                    type="number"
                    min={0}
                    max={20}
                    defaultValue={lead.bedrooms ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Baños
                  <input
                    className={inputClass}
                    name="bathrooms"
                    type="number"
                    min={0}
                    max={20}
                    defaultValue={lead.bathrooms ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Superficie estimada (m²)
                  <input
                    className={inputClass}
                    name="surface_m2"
                    type="number"
                    min={0}
                    defaultValue={lead.surface_m2 ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Presupuesto (CLP)
                  <input
                    className={inputClass}
                    name="budget_clp"
                    type="number"
                    min={0}
                    defaultValue={lead.budget_clp ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                <label className="text-sm font-medium">
                  Vendedor asignado
                  <select
                    className={inputClass}
                    name="assigned_user_id"
                    defaultValue={lead.assigned_user_id ?? ""}
                    disabled={!permissions.canManageLead}
                  >
                    <option value="">Sin asignar</option>
                    {unitMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {`${m.first_name} ${m.last_name}`.trim()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Notas
                  <textarea
                    className={inputClass}
                    name="source_notes"
                    rows={4}
                    defaultValue={lead.source_notes ?? ""}
                    disabled={!permissions.canManageLead}
                  />
                </label>
                {permissions.canManageLead && (
                  <div className="md:col-span-2">
                    <button className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white">
                      Guardar cambios
                    </button>
                  </div>
                )}
              </form>
            </Panel>
          )}

          {tab === "actividad" && (
            <Panel>
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-[#63778e]">Mensajes totales</dt>
                  <dd className="font-semibold">{conversation.message_count}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-[#63778e]">Último mensaje</dt>
                  <dd className="font-semibold">
                    {formatDateTime(conversation.last_message_at)}
                  </dd>
                </div>
                {conversation.ai_paused_reason && (
                  <div className="md:col-span-2">
                    <dt className="text-xs uppercase text-[#63778e]">
                      Motivo de pausa/escalamiento
                    </dt>
                    <dd>{conversation.ai_paused_reason}</dd>
                  </div>
                )}
                {conversation.status === "closed" && (
                  <>
                    <div>
                      <dt className="text-xs uppercase text-[#63778e]">Cerrada</dt>
                      <dd>{formatDateTime(conversation.closed_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-[#63778e]">Cerrada por</dt>
                      <dd>
                        {conversation.closer
                          ? `${conversation.closer.first_name ?? ""} ${conversation.closer.last_name ?? ""}`.trim()
                          : "Sistema"}
                      </dd>
                    </div>
                    {conversation.close_reason && (
                      <div className="md:col-span-2">
                        <dt className="text-xs uppercase text-[#63778e]">Motivo de cierre</dt>
                        <dd>{conversation.close_reason}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#63778e]">
              Acciones
            </h2>
            <ConversationActions
              conversationId={id}
              status={conversation.status}
              permissions={permissions}
              unitMembers={unitMembers}
            />
          </Panel>
          {lead && (
            <Panel>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#63778e]">
                Ficha del lead
              </h2>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-xs text-[#63778e]">Teléfono</dt>
                  <dd className="font-mono">{lead.phone_e164}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Ciudad</dt>
                  <dd>{lead.city || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Producto de interés</dt>
                  <dd>{uiLabel(lead.product_interest)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Dormitorios / Baños</dt>
                  <dd>
                    {lead.bedrooms ?? "—"} / {lead.bathrooms ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Superficie</dt>
                  <dd>{lead.surface_m2 ? `${lead.surface_m2} m²` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Presupuesto</dt>
                  <dd>
                    {lead.budget_clp
                      ? new Intl.NumberFormat("es-CL", {
                          style: "currency",
                          currency: "CLP",
                          maximumFractionDigits: 0,
                        }).format(lead.budget_clp)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#63778e]">Estado comercial</dt>
                  <dd>
                    <StatusBadge value={lead.status} />
                  </dd>
                </div>
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
