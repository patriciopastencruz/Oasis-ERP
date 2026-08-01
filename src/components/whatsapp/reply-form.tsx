import { sendManualReplyAction } from "@/modules/whatsapp/application/actions";
import { inputClass } from "@/modules/whatsapp/ui";

export function ReplyForm({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  return (
    <form action={sendManualReplyAction} className="flex items-end gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <textarea
        name="content"
        rows={2}
        required
        disabled={disabled}
        placeholder={
          disabled
            ? "Toma la conversación para poder responder."
            : "Escribe una respuesta al cliente..."
        }
        className={`${inputClass} mt-0 flex-1 disabled:bg-[#f3f5f7] disabled:text-[#9aa7b4]`}
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-[var(--oasis-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Enviar
      </button>
    </form>
  );
}
