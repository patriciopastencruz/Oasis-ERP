/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Flash,
  inputClass,
} from "@/components/finance/distribution/module-nav";
import { PageHeader, Panel } from "@/components/ui/page";
import { uiLabel } from "@/lib/ui-labels";
import { reviewOrderChangeAction } from "@/modules/finance/distribution/application/actions";
import { distributionContext } from "@/modules/finance/distribution/application/queries";
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { ctx, unit, supabase } = await distributionContext();
  const { data } = await supabase
    .from("dist_change_requests")
    .select("*,dist_orders(order_number)")
    .eq("business_unit_id", unit.id)
    .order("created_at", { ascending: false });
  return (
    <>
      <PageHeader
        eyebrow="Distribuidora Altiplánica"
        title="Solicitudes"
        description="Ediciones y anulaciones del Administrativo con revisión trazable."
      />
      <Flash success={q.success} error={q.error} />
      <div className="space-y-3">
        {data?.map((x: any) => (
          <Panel key={x.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-[#718078]">
                  {uiLabel(x.type)} · {uiLabel(x.status)}
                </p>
                <h2 className="font-semibold">
                  Pedido {x.dist_orders?.order_number}
                </h2>
                <p className="mt-2 text-sm">{x.reason}</p>
                <p className="mt-2 text-xs text-[#718078]">
                  {new Date(x.created_at).toLocaleString("es-CL")}
                </p>
              </div>
              {ctx.permissions.has("finance.distribution.requests.review") &&
                ["pending", "in_review"].includes(x.status) && (
                  <form
                    action={reviewOrderChangeAction}
                    className="flex min-w-72 flex-col gap-2"
                  >
                    <input type="hidden" name="request_id" value={x.id} />
                    <input
                      className={inputClass}
                      name="comment"
                      placeholder="Comentario de resolución"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        name="decision"
                        value="approved"
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white"
                      >
                        Aprobar
                      </button>
                      <button
                        name="decision"
                        value="rejected"
                        className="rounded-lg bg-red-700 px-3 py-2 text-xs text-white"
                      >
                        Rechazar
                      </button>
                    </div>
                  </form>
                )}
            </div>
          </Panel>
        ))}
        {!data?.length && (
          <Panel>
            <p className="text-sm text-[#718078]">No hay solicitudes.</p>
          </Panel>
        )}
      </div>
    </>
  );
}
