import Link from "next/link";

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[#d8e1dc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--oasis-primary)]";

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

export function QuotationTabs({ canApprove }: { canApprove: boolean }) {
  const tabs = [
    ["/sales/quotations", "Cotizaciones"],
    ["/sales/quotations/new", "Nueva cotización"],
    ...(canApprove ? [["/sales/quotations/approvals", "Aprobaciones"]] : []),
  ] as const;
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[var(--oasis-primary)]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
