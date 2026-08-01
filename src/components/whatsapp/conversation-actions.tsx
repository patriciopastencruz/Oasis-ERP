import { ConfirmButton } from "@/components/sales/confirm-button";
import { inputClass } from "@/modules/whatsapp/ui";
import {
  assignConversationAction,
  closeConversationAction,
  pauseAgentAction,
  releaseToAiAction,
  requestQuotationAction,
  takeConversationAction,
} from "@/modules/whatsapp/application/actions";

const buttonClass =
  "rounded-xl border border-[#d5dce4] bg-white px-3 py-2 text-xs font-semibold hover:border-[var(--oasis-primary)] hover:text-[var(--oasis-primary)]";
const primaryButtonClass =
  "rounded-xl bg-[var(--oasis-primary)] px-3 py-2 text-xs font-semibold text-white";

export function ConversationActions({
  conversationId,
  status,
  permissions,
  unitMembers,
}: {
  conversationId: string;
  status: string;
  permissions: {
    canReply: boolean;
    canControlAgent: boolean;
    canAssign: boolean;
  };
  unitMembers: { id: string; first_name: string; last_name: string }[];
}) {
  const isClosed = status === "closed";
  if (isClosed) {
    return (
      <p className="text-sm text-[#63778e]">
        Esta conversación está cerrada. No admite más acciones.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {permissions.canReply && status !== "human_active" && (
          <form action={takeConversationAction}>
            <input type="hidden" name="conversation_id" value={conversationId} />
            <button type="submit" className={primaryButtonClass}>
              Tomar conversación
            </button>
          </form>
        )}
        {permissions.canControlAgent && status !== "ai_active" && (
          <form action={releaseToAiAction}>
            <input type="hidden" name="conversation_id" value={conversationId} />
            <button type="submit" className={buttonClass}>
              Devolver a la IA
            </button>
          </form>
        )}
        {permissions.canControlAgent && status !== "paused" && (
          <form action={pauseAgentAction} className="flex items-center gap-2">
            <input type="hidden" name="conversation_id" value={conversationId} />
            <input
              type="hidden"
              name="reason"
              value="Pausada manualmente desde la bandeja"
            />
            <button type="submit" className={buttonClass}>
              Pausar IA
            </button>
          </form>
        )}
        {permissions.canReply && (
          <form action={requestQuotationAction}>
            <input type="hidden" name="conversation_id" value={conversationId} />
            <button type="submit" className={buttonClass}>
              Solicitar cotización
            </button>
          </form>
        )}
        {permissions.canReply && (
          <form action={closeConversationAction} className="flex items-center gap-2">
            <input type="hidden" name="conversation_id" value={conversationId} />
            <input type="hidden" name="reason" value="Cerrada desde la bandeja" />
            <ConfirmButton
              className={`${buttonClass} text-red-700`}
              message="¿Cerrar esta conversación? No podrá reabrirse."
            >
              Cerrar conversación
            </ConfirmButton>
          </form>
        )}
      </div>

      {permissions.canAssign && unitMembers.length > 0 && (
        <form
          action={assignConversationAction}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="conversation_id" value={conversationId} />
          <select name="assignee_id" required className={`${inputClass} mt-0 w-56`}>
            <option value="">Asignar a...</option>
            {unitMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.first_name} ${m.last_name}`.trim()}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass}>
            Asignar
          </button>
        </form>
      )}
    </div>
  );
}
