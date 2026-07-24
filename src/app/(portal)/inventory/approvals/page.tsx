import { PageHeader, Panel } from "@/components/ui/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uiLabel } from "@/lib/ui-labels";
import { requirePermission } from "@/modules/platform/auth/application/session";
import { decideMaterialChangeAction } from "@/modules/inventory/application/actions";
import { InventoryTabs, Notice, inputClass } from "@/modules/inventory/ui";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; success?: string; error?: string }>;
}) {
  const p = await searchParams;
  await requirePermission("inventory.approvals.decide");
  const s = await createSupabaseServerClient();
  let q = s
    .from("inventory_change_requests")
    .select(
      "id,request_type,reason,current_data,proposed_data,status,requested_at,decision_note,inventory_materials(code,name),profiles!inventory_change_requests_requested_by_fkey(first_name,last_name)",
    )
    .order("requested_at", { ascending: false });
  q = q.eq("status", p.status || "pending");
  const { data } = await q;
  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Solicitudes de materiales"
        description="Revisa ediciones y desactivaciones antes de que afecten el maestro."
      />
      <InventoryTabs />
      <Notice {...p} />
      <div className="mb-4 flex gap-2">
        {["pending", "approved", "rejected"].map((x) => (
          <a
            href={`?status=${x}`}
            key={x}
            className="rounded-full border bg-white px-3 py-1.5 text-sm"
          >
            {uiLabel(x)}
          </a>
        ))}
      </div>
      <div className="space-y-4">
        {data?.map((x) => {
          const m = Array.isArray(x.inventory_materials)
              ? x.inventory_materials[0]
              : x.inventory_materials,
            u = Array.isArray(x.profiles) ? x.profiles[0] : x.profiles;
          return (
            <Panel key={x.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <b>
                    {x.request_type === "edit" ? "Edición" : "Desactivación"} ·{" "}
                    {m?.code} · {m?.name}
                  </b>
                  <p className="mt-1 text-sm text-slate-600">
                    Solicita: {u?.first_name} {u?.last_name} ·{" "}
                    {new Date(x.requested_at).toLocaleString("es-CL")}
                  </p>
                  <p className="mt-2 text-sm">
                    <b>Motivo:</b> {x.reason}
                  </p>
                </div>
                <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                  {uiLabel(x.status)}
                </span>
              </div>
              {x.request_type === "edit" && (
                <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                  <pre className="overflow-auto rounded-xl bg-slate-50 p-3">
                    Actual{JSON.stringify(x.current_data, null, 2)}
                  </pre>
                  <pre className="overflow-auto rounded-xl bg-emerald-50 p-3">
                    Propuesto{JSON.stringify(x.proposed_data, null, 2)}
                  </pre>
                </div>
              )}
              {x.status === "pending" && (
                <form
                  action={decideMaterialChangeAction}
                  className="mt-4 flex flex-wrap gap-2"
                >
                  <input type="hidden" name="request_id" value={x.id} />
                  <input
                    name="note"
                    placeholder="Observación opcional"
                    className={`${inputClass} mt-0 flex-1`}
                  />
                  <button
                    name="decision"
                    value="approved"
                    className="rounded-xl bg-[#083f7d] px-4 text-white"
                  >
                    Aprobar
                  </button>
                  <button
                    name="decision"
                    value="rejected"
                    className="rounded-xl border border-red-300 px-4 text-red-700"
                  >
                    Rechazar
                  </button>
                </form>
              )}
            </Panel>
          );
        })}
        {!data?.length && (
          <Panel>
            <p className="text-sm text-slate-500">
              No hay solicitudes en este estado.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}
