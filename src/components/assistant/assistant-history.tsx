"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { listAssistantConversations } from "@/modules/assistant/application/actions";

type ConversationRow = Awaited<
  ReturnType<typeof listAssistantConversations>
>[number];

export function AssistantHistory({
  onSelect,
  onClose,
}: {
  onSelect: (conversationId: string) => void;
  onClose: () => void;
}) {
  const [conversations, setConversations] = useState<ConversationRow[] | null>(
    null,
  );

  useEffect(() => {
    listAssistantConversations().then(setConversations);
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Conversaciones anteriores</h3>
        <button onClick={onClose} aria-label="Cerrar historial">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {conversations === null && (
          <p className="p-3 text-sm text-slate-500">Cargando…</p>
        )}
        {conversations?.length === 0 && (
          <p className="p-3 text-sm text-slate-500">
            Todavía no tienes conversaciones.
          </p>
        )}
        {conversations?.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--oasis-soft)]"
          >
            <span className="block truncate font-medium">
              {c.title || "Conversación"}
            </span>
            <span className="block text-xs text-slate-500">
              {c.current_module ?? "—"} ·{" "}
              {new Date(c.updated_at).toLocaleString("es-CL", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
