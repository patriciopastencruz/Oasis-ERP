import Link from "next/link";

/** Pestañas del módulo único de Reportabilidad (reservas y cierres diarios). */
export function LodgingReportTabs({
  active,
  permissions,
}: {
  active: "reservations" | "closings";
  permissions: Set<string>;
}) {
  const tabs = [
    ...(permissions.has("lodging.reservations.view")
      ? [["reservations", "/lodging/reports", "Reservas y ocupación"] as const]
      : []),
    ...(permissions.has("lodging.closings.reports")
      ? [["closings", "/lodging/closing/reports", "Cierres diarios"] as const]
      : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav className="mb-5 flex flex-wrap gap-2 text-sm">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          className={`rounded-full border px-3 py-1.5 font-medium ${
            key === active
              ? "border-[#0b4f9c] bg-[#0b4f9c] text-white"
              : "bg-white hover:border-[#0b4f9c]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
