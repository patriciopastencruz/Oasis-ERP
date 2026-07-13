import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  LockKeyhole,
  Settings2,
  Users,
  WalletCards,
  Workflow,
  Tags,
  Landmark,
  Bell,
  ChevronDown,
  Boxes,
  FilePlus2,
  PackageMinus,
  ClipboardCheck,
  History,
  BarChart3,
  Building2,
} from "lucide-react";
import { cookies } from "next/headers";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { BusinessUnitSelector } from "@/components/layout/business-unit-selector";
type Ctx = Awaited<
  ReturnType<
    typeof import("@/modules/platform/auth/application/session").requireSession
  >
>;
const transversalNav = [
  {
    href: "/dashboard",
    label: "Dashboard Ejecutivo",
    icon: LayoutDashboard,
    permission: "reports.executive_dashboard.view",
  },
  {
    href: "/suppliers",
    label: "Proveedores",
    icon: Building2,
    permission: "finance.suppliers.view",
  },
];

const financeNav = [
  {
    href: "/finance/payment-control",
    label: "Gestión de Pagos",
    icon: WalletCards,
    permission: "finance.payment_requests.create",
  },
  {
    href: "/finance/payment-control/approvals",
    label: "Aprobaciones",
    icon: Workflow,
    permission: "finance.approvals.decide",
  },
  {
    href: "/finance/payment-control/payments",
    label: "Pagos",
    icon: WalletCards,
    permission: "finance.payments.view",
  },
  {
    href: "/finance/payment-control/reports",
    label: "Reportes",
    icon: LayoutDashboard,
    permission: "finance.reports.view",
  },
  {
    href: "/finance/payment-control/dashboard",
    label: "Dashboard financiero",
    icon: LayoutDashboard,
    permission: "finance.reports.view",
  },
];

const financeAdministrationNav = [
  {
    href: "/finance/payment-control/categories",
    label: "Categorías de gasto",
    icon: Tags,
    permission: "finance.expense_categories.manage",
    legacyPermission: "administration.categories.manage",
  },
  {
    href: "/finance/payment-control/cost-centers",
    label: "Centros de costo",
    icon: Landmark,
    permission: "finance.cost_centers.manage",
    legacyPermission: "administration.cost_centers.manage",
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    icon: Users,
    permission: "administration.users.manage",
  },
  {
    href: "/admin/roles",
    label: "Roles",
    icon: LockKeyhole,
    permission: "administration.roles.manage",
  },
  {
    href: "/admin/workflows",
    label: "Workflows",
    icon: Workflow,
    permission: "administration.approval_rules.manage",
  },
];

const inventoryNav = [
  {
    href: "/inventory",
    label: "Inicio del módulo",
    icon: Boxes,
    permission: "inventory.materials.view",
  },
  {
    href: "/inventory/materials",
    label: "Maestro de materiales",
    icon: Boxes,
    permission: "inventory.materials.view",
  },
  {
    href: "/inventory/invoices",
    label: "Ingreso de facturas",
    icon: FilePlus2,
    permission: "inventory.materials.view",
  },
  {
    href: "/inventory/outputs",
    label: "Salida de materiales",
    icon: PackageMinus,
    permission: "inventory.materials.view",
  },
  {
    href: "/inventory/movements",
    label: "Historial de movimientos",
    icon: History,
    permission: "inventory.materials.view",
  },
  {
    href: "/inventory/reports",
    label: "Reportes de inventario",
    icon: BarChart3,
    permission: "inventory.reports.export",
  },
  {
    href: "/inventory/approvals",
    label: "Solicitudes de materiales",
    icon: ClipboardCheck,
    permission: "inventory.approvals.decide",
  },
];

type NavItem =
  (typeof financeNav)[number] | (typeof financeAdministrationNav)[number];

function canView(item: NavItem, permissions: Set<string>) {
  const legacyPermission =
    "legacyPermission" in item ? item.legacyPermission : undefined;
  return (
    permissions.has(item.permission) ||
    (typeof legacyPermission === "string" && permissions.has(legacyPermission))
  );
}
export async function AppShell({
  ctx,
  children,
}: {
  ctx: Ctx;
  children: React.ReactNode;
}) {
  const store = await cookies();
  const company =
    ctx.companies.find((c) => c.id === store.get("oasis_company")?.value) ??
    ctx.companies[0];
  const companyUnits = ctx.units.filter((u) => u.company_id === company?.id);
  const savedUnitId = store.get("oasis_unit")?.value;
  const unit =
    companyUnits.find((u) => u.id === savedUnitId) ??
    companyUnits.find((u) => u.code === "OM") ??
    [...companyUnits].sort((a, b) => a.name.localeCompare(b.name, "es"))[0];
  const isOasisModulares = unit?.code === "OM";
  const homeHref = ctx.permissions.has("reports.executive_dashboard.view")
    ? "/dashboard"
    : ctx.permissions.has("inventory.materials.view")
      ? "/inventory"
      : "/finance/payment-control";
  const visibleFinanceNav = financeNav.filter((item) =>
    canView(item, ctx.permissions),
  );
  const visibleTransversalNav = transversalNav.filter((item) =>
    canView(item, ctx.permissions),
  );
  const visibleFinanceAdministrationNav = financeAdministrationNav.filter(
    (item) => canView(item, ctx.permissions),
  );
  const showFinance =
    visibleFinanceNav.length > 0 || visibleFinanceAdministrationNav.length > 0;
  const visibleInventoryNav = inventoryNav.filter((item) =>
    ctx.permissions.has(item.permission),
  );
  return (
    <div className="min-h-screen bg-[#f2f5f3] text-[#17251e] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-r bg-[#123525] p-5 text-white">
        <Link href={homeHref} className="mx-auto block w-fit">
          <span className="grid size-36 place-items-center">
            <Image
              src="/oasis-logo-crane.png"
              alt="Logo de OASIS ERP"
              width={144}
              height={144}
              priority
              className="size-36 scale-[1.55] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.18)]"
            />
          </span>
          <span className="mt-1 block text-center">
            <b className="block tracking-[.18em]">OASIS ERP</b>
            <span className="mt-1 block text-xs text-white/60">
              Gestión empresarial
            </span>
          </span>
        </Link>
        {company && companyUnits.length > 0 && (
          <BusinessUnitSelector
            key={unit?.id}
            companyId={company.id}
            unitId={unit?.id}
            units={companyUnits}
          />
        )}
        <nav className="mt-4 space-y-1">
          {showFinance && (
            <details className="group/finance">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <WalletCards size={17} />
                <span className="flex-1">Finanzas</span>
                <ChevronDown
                  size={15}
                  className="transition-transform group-open/finance:rotate-180"
                />
              </summary>
              <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
                {visibleFinanceNav.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                ))}
                {visibleFinanceAdministrationNav.length > 0 && (
                  <details className="group/admin">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden">
                      <Settings2 size={16} />
                      <span className="flex-1">Administración</span>
                      <ChevronDown
                        size={14}
                        className="transition-transform group-open/admin:rotate-180"
                      />
                    </summary>
                    <div className="ml-4 mt-1 space-y-1 border-l border-white/15 pl-2">
                      {visibleFinanceAdministrationNav.map(
                        ({ href, label, icon: Icon }) => (
                          <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/65 hover:bg-white/10 hover:text-white"
                          >
                            <Icon size={15} />
                            {label}
                          </Link>
                        ),
                      )}
                    </div>
                  </details>
                )}
              </div>
            </details>
          )}
          {isOasisModulares && visibleInventoryNav.length > 0 && (
            <details className="group/inventory">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <Boxes size={17} />
                <span className="flex-1">Inventario y Materiales</span>
                <ChevronDown
                  size={15}
                  className="transition-transform group-open/inventory:rotate-180"
                />
              </summary>
              <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
                {visibleInventoryNav.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                ))}
              </div>
            </details>
          )}
          {visibleTransversalNav.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Gestión transversal
              </p>
              {visibleTransversalNav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10"
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
          <div className="text-sm">
            <b>{unit?.name ?? company?.trade_name}</b>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              aria-label="Notificaciones"
              className="grid size-9 place-items-center rounded-full border"
            >
              <Bell size={17} />
            </Link>
            <Link
              href="/admin/profile"
              className="grid size-9 place-items-center rounded-full bg-[#dceee4] font-bold"
            >
              {ctx.profile.first_name[0]}
              {ctx.profile.last_name[0]}
            </Link>
            <div className="hidden text-sm sm:block">
              <b>
                {ctx.profile.first_name} {ctx.profile.last_name}
              </b>
              <span className="block text-xs">{ctx.role?.name}</span>
            </div>
            <form action={logoutAction}>
              <button className="rounded-lg border px-3 py-2 text-xs">
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
