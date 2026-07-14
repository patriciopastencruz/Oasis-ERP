import { PageHeader } from "@/components/ui/page";
import { PaymentQueue } from "@/components/finance/payment-queue";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <>
      <PageHeader
        title="Pagos ejecutados"
        description="Historial de pagos con sus comprobantes."
        eyebrow="Finanzas · Solicitud de Pagos"
      />
      <PaymentQueue params={await searchParams} fixedStatus="paid" />
    </>
  );
}
