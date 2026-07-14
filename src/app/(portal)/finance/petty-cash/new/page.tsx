import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { PettyCashReportForm } from "@/components/finance/petty-cash-report-form";
import { activeCatalogs, currentWeekSummary, pettyCashContext } from "@/modules/finance/petty-cash/application/queries";
import { chileWeek } from "@/modules/finance/petty-cash/domain/petty-cash";

export default async function NewPettyCashReport() {
  const { ctx, selected } = await pettyCashContext();
  if (!ctx.permissions.has("finance.petty_cash.create")) redirect("/no-access");
  const [{ categories, centers }, summaries] = await Promise.all([
    activeCatalogs(),
    Promise.all(ctx.units.map(async (unit) => [unit.id, await currentWeekSummary(unit.id)] as const)),
  ]);
  const orderedUnits = selected ? [selected, ...ctx.units.filter((unit) => unit.id !== selected.id)] : ctx.units;
  return <><PageHeader title="Nueva rendición" description="Agrega uno o varios gastos. El borrador no consume el límite semanal hasta que lo envíes." eyebrow="Finanzas · Caja Chica" /><PettyCashReportForm units={orderedUnits} categories={categories} centers={centers} week={chileWeek()} weeklySummaries={Object.fromEntries(summaries)} /></>;
}
