"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  saveSupplierBankAccountAction,
  type BankResult,
} from "@/modules/finance/suppliers/application/bank-actions";
import { chileanBanks } from "@/modules/finance/suppliers/domain/chilean-banks";
export function SupplierBankForm({
  supplierId,
  account,
}: {
  supplierId: string;
  account?: Record<string, unknown>;
}) {
  const router = useRouter(),
    [save, saveAction, saving] = useActionState(saveSupplierBankAccountAction, {
      success: false,
    } as BankResult);
  useEffect(() => {
    if (save.success) router.refresh();
  }, [save.success, router]);
  const input = "mt-1 w-full rounded-xl border p-3";
  return (
    <div className="space-y-5">
      <form action={saveAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="supplier_id" value={supplierId} />
        <label className="text-sm">
          Banco
          <select
            name="bank_name"
            defaultValue={String(account?.bank_name ?? "")}
            required
            className={input}
          >
            <option value="">Selecciona un banco</option>
            {chileanBanks.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tipo de cuenta
          <select
            name="account_type"
            defaultValue={String(account?.account_type ?? "checking")}
            className={input}
          >
            <option value="checking">Cuenta corriente</option>
            <option value="sight">Cuenta vista</option>
            <option value="savings">Cuenta de ahorro</option>
            <option value="rut">Cuenta RUT</option>
            <option value="other">Otra</option>
          </select>
        </label>
        <label className="text-sm">
          Número de cuenta
          <input
            name="account_number"
            defaultValue={String(account?.account_number ?? "")}
            required
            className={input}
          />
        </label>
        <label className="text-sm">
          Titular
          <input
            name="account_holder_name"
            defaultValue={String(account?.account_holder_name ?? "")}
            required
            className={input}
          />
        </label>
        <label className="text-sm">
          RUT titular
          <input
            name="account_holder_rut"
            defaultValue={String(account?.account_holder_rut ?? "")}
            required
            className={input}
          />
        </label>
        <label className="text-sm">
          Correo comprobante
          <input
            type="email"
            name="receipt_email"
            defaultValue={String(account?.receipt_email ?? "")}
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={account?.active !== false}
          />{" "}
          Cuenta activa
        </label>
        <div className="md:col-span-2">
          {save.message && <p className="mb-2 text-sm">{save.message}</p>}
          <button
            disabled={saving}
            className="rounded-xl bg-[#173f2d] px-5 py-3 font-semibold text-white"
          >
            Guardar cuenta
          </button>
        </div>
      </form>
    </div>
  );
}
