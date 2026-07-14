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
  CalendarDays,
  BedDouble,
  LogIn,
  LogOut,
  RefreshCw,
  SlidersHorizontal,
  ReceiptText,
  ShoppingCart,
  UserRound,
  Route,
} from "lucide-react";
import { cookies } from "next/headers";
import { logoutAction } from "@/modules/platform/auth/application/actions";
import { BusinessUnitSelector } from "@/components/layout/business-unit-selector";
import { getBusinessUnitBrand } from "@/config/business-units";
type Ctx = Awaited<
  ReturnType<
    typeof import("@/modules/platform/auth/application/session").requireSession
  >
>;
const transversalNav = [
  {
    href: "/dashboard",
    label: "Panel ejecutivo",
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
    href: "/finance/petty-cash",
    label: "Caja Chica",
    icon: ReceiptText,
    permission: "finance.petty_cash.create",
    legacyPermission: "finance.petty_cash.view",
  },
  {
    href: "/finance/payment-control",
    label: "Solicitud de Pagos",
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
    label: "Panel financiero",
    icon: LayoutDashboard,
    permission: "finance.reports.view",
  },
];

const distributionNav = [
  {
    href: "/finance/distribution",
    label: "Pedidos",
    icon: ShoppingCart,
    permission: "finance.distribution.view",
  },
  {
    href: "/finance/distribution/driver",
    label: "Ruta y entregas",
    icon: Route,
    permission: "finance.distribution.view",
  },
  {
    href: "/finance/distribution/customers",
    label: "Clientes",
    icon: UserRound,
    permission: "finance.distribution.customers.manage",
  },
  {
    href: "/finance/distribution/catalogs",
    label: "Productos y precios",
    icon: Boxes,
    permission: "finance.distribution.catalogs.manage",
  },
  {
    href: "/finance/distribution/account-statements",
    label: "Estado de pago",
    icon: ReceiptText,
    permission: "finance.distribution.reports.view",
  },
  {
    href: "/finance/distribution/payments",
    label: "Cobranzas",
    icon: WalletCards,
    permission: "finance.distribution.payments.manage",
  },
  {
    href: "/finance/distribution/reports",
    label: "Cierre y reportabilidad",
    icon: BarChart3,
    permission: "finance.distribution.reports.view",
  },
  {
    href: "/finance/distribution/requests",
    label: "Solicitudes",
    icon: ClipboardCheck,
    permission: "finance.distribution.requests.review",
    legacyPermission: "finance.distribution.requests.create",
  },
] as const;

const administrationNav = [
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
    label: "Flujos de aprobación",
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

const lodgingNav = [
  {
    href: "/lodging",
    label: "Calendario",
    icon: CalendarDays,
    permission: "lodging.reservations.view",
  },
  {
    href: "/lodging/reservations",
    label: "Reservas",
    icon: BedDouble,
    permission: "lodging.reservations.view",
  },
  {
    href: "/lodging/arrivals",
    label: "Llegadas",
    icon: LogIn,
    permission: "lodging.reservations.view",
  },
  {
    href: "/lodging/departures",
    label: "Salidas",
    icon: LogOut,
    permission: "lodging.reservations.view",
  },
  {
    href: "/lodging/rooms",
    label: "Habitaciones",
    icon: BedDouble,
    permission: "lodging.reservations.view",
  },
  {
    href: "/lodging/ical",
    label: "Sincronización iCal",
    icon: RefreshCw,
    permission: "lodging.ical.sync",
  },
  {
    href: "/lodging/settings",
    label: "Configuración",
    icon: SlidersHorizontal,
    permission: "lodging.reservations.view",
  },
] as const;

type NavItem = { permission: string; legacyPermission?: string };
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
  const isHostalUruguay = unit?.code === "HU";
  const isAltiplanica = unit?.code === "DA";
  const unitBrand = getBusinessUnitBrand(unit?.code);
  const homeHref = ctx.permissions.has("reports.executive_dashboard.view")
    ? "/dashboard"
    : isAltiplanica && ctx.permissions.has("finance.distribution.view")
      ? "/finance/distribution"
      : ctx.permissions.has("inventory.materials.view")
        ? "/inventory"
        : "/finance/payment-control";
  const visibleFinanceNav = financeNav.filter((item) =>
    canView(item, ctx.permissions),
  );
  const visibleDistributionNav = isAltiplanica
    ? distributionNav.filter((item) => canView(item, ctx.permissions))
    : [];
  const visibleTransversalNav = transversalNav.filter((item) =>
    canView(item, ctx.permissions),
  );
  const visibleAdministrationNav = administrationNav.filter((item) =>
    canView(item, ctx.permissions),
  );
  const showFinance = visibleFinanceNav.length > 0;
  const visibleInventoryNav = inventoryNav.filter((item) =>
    ctx.permissions.has(item.permission),
  );
  const visibleLodgingNav = lodgingNav.filter((item) =>
    ctx.permissions.has(item.permission),
  );
  return (
    <div className="min-h-screen bg-[#f2f5f3] text-[#17251e] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="flex min-h-screen flex-col border-r bg-[#123525] p-5 text-white">
        <Link href={homeHref} className="mx-auto block w-fit">
          <span className="grid size-36 place-items-center">
            <Image
              src={unitBrand.logo}
              alt={`Logo de ${unit?.name ?? "OASIS ERP"}`}
              width={144}
              height={144}
              priority
              className="size-32 rounded-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.18)]"
            />
          </span>
          <span className="mt-1 block text-center">
            <b className="block text-sm tracking-[.08em]">
              {unit?.name ?? "OASIS ERP"}
            </b>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[.16em] text-white/60">
              ERP OASIS
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
        <nav className="mt-4 flex-1 space-y-1">
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
              </div>
            </details>
          )}
          {visibleDistributionNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
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
          {isHostalUruguay && visibleLodgingNav.length > 0 && (
            <details className="group/lodging">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <BedDouble size={17} />
                <span className="flex-1">Gestión de reservas</span>
                <ChevronDown
                  size={15}
                  className="transition-transform group-open/lodging:rotate-180"
                />
              </summary>
              <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
                {visibleLodgingNav.map(({ href, label, icon: Icon }) => (
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
          {(visibleTransversalNav.length > 0 ||
            visibleAdministrationNav.length > 0) && (
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
                  {isHostalUruguay && href === "/dashboard"
                    ? "Dashboard Ejecutivo"
                    : label}
                </Link>
              ))}
              {visibleAdministrationNav.length > 0 && (
                <details className="group/admin">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                    <Settings2 size={17} />
                    <span className="flex-1">Administración</span>
                    <ChevronDown
                      size={15}
                      className="transition-transform group-open/admin:rotate-180"
                    />
                  </summary>
                  <div className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
                    {visibleAdministrationNav.map(
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
          )}
        </nav>
        <footer className="mt-6 border-t border-white/10 pt-4 text-center">
          <p className="text-[10px] uppercase tracking-[.15em] text-white/45">
            Gestión empresarial
          </p>
          <p className="mt-1 text-[10px] text-white/30">OASIS ERP</p>
        </footer>
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
