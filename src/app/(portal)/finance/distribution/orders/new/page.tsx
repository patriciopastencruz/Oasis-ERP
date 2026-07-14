/* eslint-disable @typescript-eslint/no-explicit-any */
import { Flash } from "@/components/finance/distribution/module-nav";
import { OrderForm } from "@/components/finance/distribution/order-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { dailyDistributionData } from "@/modules/finance/distribution/application/queries";
import { requirePermission } from "@/modules/platform/auth/application/session";
export default async function NewOrder({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  await requirePermission("finance.distribution.orders.create");
  const date =
    q.date ??
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const data = await dailyDistributionData(date);
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Nuevo pedido"
        description="Pedido planificado para un cliente registrado y activo."
      />
      <Flash error={q.error} />
      <Panel>
        <OrderForm
          customers={data.customers as any}
          products={data.products as any}
          initialDate={date}
        />
      </Panel>
    </>
  );
}
