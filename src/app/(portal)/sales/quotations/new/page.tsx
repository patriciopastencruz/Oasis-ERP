import { QuotationForm } from "@/components/sales/quotation-form";
import { PageHeader, Panel } from "@/components/ui/page";
import { createQuotationAction } from "@/modules/sales/quotations/application/actions";
import { salesContext } from "@/modules/sales/quotations/application/queries";
import { Notice } from "@/modules/sales/ui";

export default async function NewQuotation({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  await salesContext("sales.quotations.create");
  return (
    <>
      <PageHeader
        eyebrow="Oasis Modulares"
        title="Nueva cotización"
        description="Se guarda como borrador; el número se asigna al enviarla a aprobación."
      />
      <Notice error={q.error} />
      <Panel>
        <QuotationForm
          action={createQuotationAction}
          submitLabel="Guardar borrador"
        />
      </Panel>
    </>
  );
}
