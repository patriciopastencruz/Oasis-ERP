import Link from "next/link";
import {
  Boxes,
  FilePlus2,
  PackageMinus,
  History,
  BarChart3,
  ClipboardCheck,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { requirePermission } from "@/modules/platform/auth/application/session";
const cards = [
  [
    "/inventory/materials",
    "Maestro de materiales",
    "Códigos, existencias, precios e historial",
    Boxes,
    "inventory.materials.view",
  ],
  [
    "/inventory/invoices/new",
    "Ingreso de facturas",
    "Registra compras y aumenta el stock",
    FilePlus2,
    "inventory.purchases.create",
  ],
  [
    "/inventory/outputs/new",
    "Salida de materiales",
    "Consumo operacional, fallas y pérdidas",
    PackageMinus,
    "inventory.outputs.create",
  ],
  [
    "/inventory/movements",
    "Historial de movimientos",
    "Trazabilidad completa de entradas y salidas",
    History,
    "inventory.materials.view",
  ],
  [
    "/inventory/reports",
    "Reportes de inventario",
    "Filtros y exportaciones a Excel",
    BarChart3,
    "inventory.reports.export",
  ],
  [
    "/inventory/approvals",
    "Solicitudes de materiales",
    "Aprueba ediciones y desactivaciones",
    ClipboardCheck,
    "inventory.approvals.decide",
  ],
] as const;
export default async function Page() {
  const ctx = await requirePermission("inventory.materials.view");
  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Inventario y Materiales"
        description="Controla materiales, compras, consumos y existencias con trazabilidad completa."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter((x) => ctx.permissions.has(x[4]))
          .map(([href, title, description, Icon]) => (
            <Link href={href} key={href}>
              <Panel className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                <Icon className="text-[#0b4f9c]" />
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              </Panel>
            </Link>
          ))}
      </div>
    </>
  );
}
