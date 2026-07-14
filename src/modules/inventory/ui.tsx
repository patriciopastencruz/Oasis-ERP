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
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function InventoryTabs() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {[
        ["/inventory/materials", "Materiales"],
        ["/inventory/invoices", "Facturas"],
        ["/inventory/outputs", "Salidas"],
        ["/inventory/movements", "Movimientos"],
        ["/inventory/reports", "Reportes"],
        ["/inventory/approvals", "Aprobaciones"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border bg-white px-3 py-1.5 font-medium hover:border-[#277a55]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
export const number = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(
    Number(value || 0),
  );
