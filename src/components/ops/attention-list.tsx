import Link from "next/link";
import { selectOpsUnitAction } from "@/modules/lodging/application/ops-actions";
import type { AttentionItem, AttentionLevel } from "@/modules/lodging/domain/attention";

const tone: Record<AttentionLevel, string> = {
  critical: "border-red-300 bg-red-50 text-red-900",
  serious: "border-orange-300 bg-orange-50 text-orange-950",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};
const icon: Record<AttentionLevel, string> = { critical: "⚠", serious: "⚠", warning: "!", info: "ℹ" };
const label: Record<AttentionLevel, string> = { critical: "Crítico", serious: "Grave", warning: "Atención", info: "Info" };

function Body({ item, showUnit }: { item: AttentionItem; showUnit: boolean }) {
  return (
    <>
      <span className="sr-only">{label[item.level]}: </span>
      <span aria-hidden>{icon[item.level]} </span>
      {showUnit && <b className="mr-1 uppercase tracking-wide">{item.unitName} ·</b>}
      {item.text}
      {item.href && <span className="float-right pl-2 opacity-60">›</span>}
    </>
  );
}

/**
 * REQUIERE ATENCIÓN: excepciones ordenadas por criticidad y tiempo al check-in.
 * Un toque lleva a resolverla; si es de otro hostal, primero lo selecciona.
 */
export function AttentionList({ items, currentUnitId, showUnit, limit = 12 }: { items: AttentionItem[]; currentUnitId: string; showUnit: boolean; limit?: number }) {
  const shown = items.slice(0, limit);
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        Requiere atención
        <span className={`rounded-full px-2 py-0.5 text-xs ${items.length ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{items.length}</span>
      </h2>
      {!items.length ? (
        <p className="rounded-2xl border border-dashed border-emerald-300 bg-white/60 p-4 text-center text-sm font-semibold text-emerald-800">✓ Nada pendiente fuera de lo normal.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((item, i) => {
            const cls = `block w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${tone[item.level]}`;
            return (
              <li key={`${item.unitId}-${item.roomId}-${item.kind}-${i}`}>
                {!item.href ? (
                  <p className={cls}>
                    <Body item={item} showUnit={showUnit} />
                  </p>
                ) : item.unitId && item.unitId !== currentUnitId ? (
                  <form action={selectOpsUnitAction}>
                    <input type="hidden" name="unit_id" value={item.unitId} />
                    <input type="hidden" name="next" value={item.href} />
                    <button className={cls}>
                      <Body item={item} showUnit={showUnit} />
                    </button>
                  </form>
                ) : (
                  <Link href={item.href} className={cls}>
                    <Body item={item} showUnit={showUnit} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown.length && <p className="mt-2 text-center text-xs text-slate-500">y {items.length - shown.length} más en la vista consolidada</p>}
    </section>
  );
}
