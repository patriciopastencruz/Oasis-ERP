"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupplierAction } from "@/modules/finance/payment-control/application/actions";
import type { ActionResult } from "@/modules/finance/payment-control/application/schemas";
export function SupplierQuickCreate({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createSupplierAction, {
    success: false,
  } as ActionResult);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);
  return (
    <details className="mb-5 rounded-2xl border border-dashed border-[#7da3ce] bg-[#f6f9fc] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#0b4f9c]">
        Crear proveedor nuevo
      </summary>
      <form action={action} className="mt-4 grid gap-3 md:grid-cols-4">
        <input type="hidden" name="company_id" value={companies[0]?.id} />
        <input
          name="rut"
          placeholder="RUT"
          required
          className="rounded-xl border p-2.5 text-sm"
        />
        <input
          name="legal_name"
          placeholder="Razón social"
          required
          className="rounded-xl border p-2.5 text-sm"
        />
        <button
          disabled={pending}
          className="rounded-xl bg-[#0b4f9c] px-4 text-sm font-semibold text-white"
        >
          {pending ? "Creando…" : "Crear proveedor"}
        </button>
        {state.message && (
          <p
            className={`text-sm md:col-span-4 ${state.success ? "text-emerald-700" : "text-red-700"}`}
          >
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}
