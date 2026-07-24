"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown, Compass, Link2 } from "lucide-react";
import type {
  AssistantAction,
  AssistantSource,
} from "@/modules/assistant/domain/types";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  actions?: AssistantAction[];
  suggestions?: string[];
  sources?: AssistantSource[];
  missingFields?: string[];
  createdAt: string;
};

function highlightElement(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-4", "ring-[var(--oasis-accent)]", "ring-offset-2");
  setTimeout(() => {
    el.classList.remove(
      "ring-4",
      "ring-[var(--oasis-accent)]",
      "ring-offset-2",
    );
  }, 2000);
}

function ActionButton({
  action,
  onSuggestion,
}: {
  action: AssistantAction;
  onSuggestion: (prompt: string) => void;
}) {
  const router = useRouter();
  const base =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--oasis-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--oasis-primary-dark)] hover:bg-[var(--oasis-soft)]";
  if (action.type === "navigate") {
    return (
      <button className={base} onClick={() => router.push(action.route)}>
        <Compass size={13} /> {action.label}
      </button>
    );
  }
  if (action.type === "highlight") {
    return (
      <button
        className={base}
        onClick={() => highlightElement(action.elementId)}
      >
        <Link2 size={13} /> {action.label}
      </button>
    );
  }
  if (action.type === "suggestion") {
    return (
      <button className={base} onClick={() => onSuggestion(action.prompt)}>
        {action.label}
      </button>
    );
  }
  return <span className={base}>{action.label}</span>;
}

export function AssistantMessageBubble({
  message,
  onSuggestion,
}: {
  message: ChatMessage;
  onSuggestion: (prompt: string) => void;
}) {
  const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | null>(
    null,
  );
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const isUser = message.role === "user";
  const isProblem = message.role === "error" || message.role === "system";

  async function sendFeedback(rating: "helpful" | "not_helpful") {
    setFeedback(rating);
    if (rating === "not_helpful") setShowComment(true);
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, rating }),
      });
    } catch {
      // silencioso: la evaluación es secundaria a la conversación
    }
  }

  async function sendComment() {
    if (!comment.trim()) return;
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message.id,
          rating: "not_helpful",
          comment: comment.trim(),
        }),
      });
    } catch {
      // silencioso
    }
    setShowComment(false);
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-[var(--oasis-primary)] text-white"
            : isProblem
              ? "bg-amber-50 text-amber-900"
              : "bg-[var(--oasis-soft)] text-[#151d27]"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!!message.missingFields?.length && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-80">
            {message.missingFields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}

        {!!message.actions?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.actions.map((a, i) => (
              <ActionButton key={i} action={a} onSuggestion={onSuggestion} />
            ))}
          </div>
        )}

        {!!message.suggestions?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="rounded-full border border-[var(--oasis-border)] bg-white px-3 py-1 text-xs text-[var(--oasis-primary-dark)] hover:bg-[var(--oasis-soft)]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {!!message.sources?.length && (
          <p className="mt-2 text-[11px] italic opacity-70">
            Fuente: {message.sources.map((s) => s.title).join(", ")}
          </p>
        )}

        {!isUser && !isProblem && (
          <div className="mt-2 flex items-center gap-2">
            <button
              aria-label="Útil"
              onClick={() => sendFeedback("helpful")}
              className={`rounded-md p-1 ${feedback === "helpful" ? "text-[var(--oasis-accent)]" : "text-slate-400 hover:text-slate-600"}`}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              aria-label="No fue útil"
              onClick={() => sendFeedback("not_helpful")}
              className={`rounded-md p-1 ${feedback === "not_helpful" ? "text-red-500" : "text-slate-400 hover:text-slate-600"}`}
            >
              <ThumbsDown size={14} />
            </button>
            {showComment && (
              <div className="flex flex-1 items-center gap-1">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="¿Qué faltó? (opcional)"
                  className="w-full rounded-md border px-2 py-1 text-xs"
                />
                <button
                  onClick={sendComment}
                  className="rounded-md bg-[var(--oasis-primary)] px-2 py-1 text-xs text-white"
                >
                  Enviar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
