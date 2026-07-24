import Link from "next/link";
import {
  FilePlus2,
  FolderOpen,
  CheckCircle2,
  BarChart3,
  Clock3,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/ui/page";
import { requireSession } from "@/modules/platform/auth/application/session";
const cards = [
  {
    href: "/finance/payment-control/new",
    title: "Nueva solicitud",
    description: "Registra y guarda un borrador.",
    icon: FilePlus2,
    permission: "finance.payment_requests.create",
  },
  {
    href: "/finance/payment-control/my-requests",
    title: "Mis solicitudes",
    description: "Consulta, filtra y continúa tus solicitudes.",
    icon: FolderOpen,
    permission: "finance.payment_requests.view_own",
  },
  {
    href: "/finance/payment-control/approvals",
    title: "Pendientes de aprobación",
    description: "Revisa y decide las etapas asignadas.",
    icon: Clock3,
    permission: "finance.approvals.decide",
  },
  {
    href: "/finance/payment-control/payments",
    title: "Pagos aprobados",
    description: "Programa y registra pagos autorizados.",
    icon: CheckCircle2,
    permission: "finance.payments.view",
  },
  {
    href: "/finance/payment-control/reports",
    title: "Reportes",
    description: "Consulta y exporta información financiera.",
    icon: BarChart3,
    permission: "finance.reports.view",
  },
];
export default async function PaymentControl() {
  const ctx = await requireSession();
  return (
    <>
      <PageHeader
        title="Solicitud de Pagos"
        description="Registra solicitudes, adjunta respaldos y consulta su avance de aprobación."
        eyebrow="Finanzas"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter(
            (x) =>
              ctx.permissions.has(x.permission) ||
              (x.href === "/finance/payment-control/my-requests" &&
                ctx.permissions.has("finance.payment_requests.create")),
          )
          .map(({ href, title, description, icon: Icon }) => (
            <Link key={title} href={href}>
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
