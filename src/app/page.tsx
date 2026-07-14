import { redirect } from "next/navigation";
import { getSessionContext } from "@/modules/platform/auth/application/session";
export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  redirect(
    ctx.permissions.has("reports.executive_dashboard.view")
      ? "/dashboard"
      : ctx.role?.key === "driver"
        ? "/finance/distribution/driver"
        : ctx.permissions.has("finance.distribution.view")
          ? "/finance/distribution"
          : ctx.permissions.has("finance.payment_requests.create") ||
              ctx.permissions.has("finance.payment_requests.view_own")
            ? "/finance/payment-control"
            : ctx.permissions.has("inventory.materials.view")
              ? "/inventory"
              : ctx.permissions.has("lodging.reservations.view")
                ? "/lodging"
                : "/no-access",
  );
}
