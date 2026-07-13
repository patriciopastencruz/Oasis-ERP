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
    <section className="rounded-3xl border border-[#d8e3dc] bg-white p-8 shadow-[0_24px_80px_rgba(22,61,43,.12)]">
      <p className="text-xs font-bold tracking-[.22em] text-[#277a55]">
        OASIS ERP
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#66766d]">{description}</p>
      <div className="mt-7">{children}</div>
      <p className="mt-6 text-center text-xs text-[#7a8981]">
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
        className="mt-2 w-full rounded-xl border border-[#cfdbd3] bg-white px-4 py-3 outline-none transition focus:border-[#277a55] focus:ring-2 focus:ring-[#d9eee3]"
      />
    </label>
  );
}
export function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button className="w-full rounded-xl bg-[#173f2d] px-4 py-3 font-semibold text-white transition hover:bg-[#225b42]">
      {children}
    </button>
  );
}
