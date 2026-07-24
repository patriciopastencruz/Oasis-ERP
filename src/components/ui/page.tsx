export function PageHeader({
  title,
  description,
  eyebrow = "OASIS ERP",
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <header className="mb-7">
      <p
        className="text-xs font-bold uppercase tracking-[.18em]"
        style={{ color: "var(--oasis-accent, #0b4f9c)" }}
      >
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c6f85]">
        {description}
      </p>
    </header>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[#d9dfe6] bg-white p-5 shadow-[0_10px_30px_rgba(20,57,39,.04)] ${className}`}
    >
      {children}
    </section>
  );
}
export function ComingSoon({ name }: { name: string }) {
  return (
    <Panel>
      <p className="text-sm font-semibold">{name}</p>
      <p className="mt-2 text-sm text-[#63778e]">
        La infraestructura está preparada. El módulo funcional se desarrollará
        en una etapa posterior.
      </p>
    </Panel>
  );
}
