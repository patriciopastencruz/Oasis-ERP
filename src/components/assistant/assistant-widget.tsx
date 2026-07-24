"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Minus,
  MessageSquarePlus,
  History as HistoryIcon,
  X,
  Send,
  Loader2,
} from "lucide-react";
import { useCurrentScreen } from "@/components/assistant/use-current-screen";
import {
  AssistantMessageBubble,
  type ChatMessage,
} from "@/components/assistant/assistant-message";
import { AssistantHistory } from "@/components/assistant/assistant-history";
import { listAssistantMessages } from "@/modules/assistant/application/actions";
import type { AssistantResponse } from "@/modules/assistant/domain/types";

const QUICK_SUGGESTIONS = [
  "¿Qué puedo hacer en esta pantalla?",
  "¿Qué me falta completar aquí?",
  "¿Cómo llego a lo que necesito?",
];

function uid() {
  return crypto.randomUUID();
}

export function AssistantWidget({
  enabled,
  welcomeMessage,
}: {
  enabled: boolean;
  welcomeMessage: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    welcomeMessage
      ? [
          {
            id: uid(),
            role: "assistant",
            content: welcomeMessage,
            createdAt: new Date().toISOString(),
          },
        ]
      : [],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const screen = useCurrentScreen();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setLastFailedMessage(null);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ]);
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            currentScreen: screen,
          }),
        });
        const data: AssistantResponse = await res.json();
        if (data.conversationId) setConversationId(data.conversationId);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: data.success
              ? "assistant"
              : data.errorCode === "not_configured"
                ? "system"
                : "error",
            content: data.message,
            actions: data.actions,
            suggestions: data.suggestions,
            sources: data.sources,
            missingFields: data.missingFields,
            createdAt: new Date().toISOString(),
          },
        ]);
        if (!data.success) setLastFailedMessage(trimmed);
      } catch {
        if (controller.signal.aborted) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "system",
              content: "Consulta cancelada.",
              createdAt: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "error",
              content:
                "No fue posible conectar con el asistente. Intenta nuevamente.",
              createdAt: new Date().toISOString(),
            },
          ]);
          setLastFailedMessage(trimmed);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [conversationId, loading, screen],
  );

  function cancel() {
    abortRef.current?.abort();
  }

  function newConversation() {
    setConversationId(undefined);
    setMessages(
      welcomeMessage
        ? [
            {
              id: uid(),
              role: "assistant",
              content: welcomeMessage,
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
    );
    setShowHistory(false);
  }

  async function openConversation(id: string) {
    setConversationId(id);
    setShowHistory(false);
    const rows = await listAssistantMessages(id);
    setMessages(
      rows
        .filter((r) => r.role !== "system")
        .map((r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          return {
            id: r.id,
            role: r.role as ChatMessage["role"],
            content: r.content,
            actions: Array.isArray(meta.actions)
              ? (meta.actions as ChatMessage["actions"])
              : undefined,
            suggestions: Array.isArray(meta.suggestions)
              ? (meta.suggestions as string[])
              : undefined,
            missingFields: Array.isArray(meta.missingFields)
              ? (meta.missingFields as string[])
              : undefined,
            createdAt: r.created_at,
          };
        }),
    );
  }

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[var(--oasis-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--oasis-primary-dark)] ${open && !minimized ? "hidden" : "flex"}`}
        aria-label="Abrir Asistente ERP"
      >
        <Bot size={20} />
        <span className="hidden sm:inline">Asistente ERP</span>
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,85vh)] sm:w-[400px] ${minimized ? "sm:hidden" : ""}`}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl sm:border">
            <div className="flex items-center justify-between border-b bg-[var(--oasis-primary)] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Bot size={18} />
                <div>
                  <p className="text-sm font-semibold leading-none">
                    Asistente ERP
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/80">
                    <span className="size-1.5 rounded-full bg-emerald-300" /> En
                    línea
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={newConversation}
                  aria-label="Nueva conversación"
                  className="rounded-md p-1.5 hover:bg-white/10"
                >
                  <MessageSquarePlus size={16} />
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  aria-label="Historial"
                  className="rounded-md p-1.5 hover:bg-white/10"
                >
                  <HistoryIcon size={16} />
                </button>
                <button
                  onClick={() => setMinimized(true)}
                  aria-label="Minimizar"
                  className="hidden rounded-md p-1.5 hover:bg-white/10 sm:block"
                >
                  <Minus size={16} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="rounded-md p-1.5 hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {showHistory && (
              <AssistantHistory
                onSelect={openConversation}
                onClose={() => setShowHistory(false)}
              />
            )}

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              {messages.map((m) => (
                <AssistantMessageBubble
                  key={m.id}
                  message={m}
                  onSuggestion={send}
                />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Pensando…
                </div>
              )}
              {messages.length <= 1 && !loading && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {QUICK_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-[var(--oasis-border)] bg-white px-3 py-1 text-xs text-[var(--oasis-primary-dark)] hover:bg-[var(--oasis-soft)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t p-3">
              {lastFailedMessage && !loading && (
                <button
                  onClick={() => send(lastFailedMessage)}
                  className="mb-2 text-xs font-semibold text-[var(--oasis-primary-dark)] underline"
                >
                  Reintentar
                </button>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder="Escribe tu consulta…"
                  className="max-h-28 flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--oasis-accent)]"
                />
                {loading ? (
                  <button
                    onClick={cancel}
                    aria-label="Cancelar"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-200"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => send(input)}
                    disabled={!input.trim()}
                    aria-label="Enviar"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--oasis-primary)] text-white disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
