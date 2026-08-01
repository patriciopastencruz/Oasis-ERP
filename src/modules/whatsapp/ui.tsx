import Link from "next/link";

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#d5dce4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--oasis-primary)]";

export function Notice({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  const message = success || error;
  if (!message) return null;
  return (
    <p
      className={`mb-5 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}
    >
      {message}
    </p>
  );
}

const CONVERSATION_DETAIL_TABS = [
  ["conversacion", "Conversación"],
  ["lead", "Lead"],
  ["actividad", "Actividad"],
] as const;
export type ConversationDetailTab = (typeof CONVERSATION_DETAIL_TABS)[number][0];

/** Pestañas server-rendered vía ?tab=, mismo patrón que ProjectTabs en sales/ui.tsx. */
export function ConversationTabs({
  conversationId,
  active,
}: {
  conversationId: string;
  active: string;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b text-sm">
      {CONVERSATION_DETAIL_TABS.map(([key, label]) => (
        <Link
          key={key}
          href={`/whatsapp/${conversationId}?tab=${key}`}
          className={`rounded-t-lg px-3 py-2 font-medium ${
            active === key
              ? "border-b-2 border-[var(--oasis-primary)] text-[var(--oasis-primary)]"
              : "text-[#5c6f85] hover:text-[var(--oasis-primary)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function InboxTabs({ active }: { active?: string }) {
  const tabs = [
    ["", "Bandeja"],
    ["leads", "Leads"],
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={key ? `/whatsapp/${key}` : "/whatsapp"}
          className={`rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[var(--oasis-primary)] ${
            active === key
              ? "border-[var(--oasis-primary)] text-[var(--oasis-primary)]"
              : ""
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
