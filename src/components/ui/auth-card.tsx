import Link from "next/link";
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[#c9dbee] bg-white p-8 shadow-[0_24px_80px_rgba(8,43,89,.12)]">
      <p className="text-xs font-bold tracking-[.22em] text-[#0b4f9c]">
        OASIS ERP
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#5a6d82]">{description}</p>
      <div className="mt-7">{children}</div>
      <p className="mt-6 text-center text-xs text-[#6b8098]">
        <Link href="/login">Acceso seguro</Link>
      </p>
    </section>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-xl border border-[#c9dbee] bg-white px-4 py-3 outline-none transition focus:border-[#0b4f9c] focus:ring-2 focus:ring-[#dbe9f8]"
      />
    </label>
  );
}
export function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button className="w-full rounded-xl bg-[#083f7d] px-4 py-3 font-semibold text-white transition hover:bg-[#0b4f9c]">
      {children}
    </button>
  );
}
