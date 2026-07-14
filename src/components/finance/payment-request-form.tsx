"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { savePaymentRequestAction } from "@/modules/finance/payment-control/application/actions";
import type { ActionResult } from "@/modules/finance/payment-control/application/schemas";
import { supplierBankSummaryAction } from "@/modules/finance/suppliers/application/bank-actions";

type Item = {
  id: string;
  name?: string;
  legal_name?: string;
  rut?: string;
  company_id?: string;
  business_unit_id?: string | null;
};
export function PaymentRequestForm({
  request,
  companies,
  units,
  suppliers,
  categories,
  centers,
}: {
  request?: Record<string, unknown>;
  companies: Item[];
  units: Item[];
  suppliers: Item[];
  categories: Item[];
  centers: Item[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(savePaymentRequestAction, {
    success: false,
  } as ActionResult);
  const company = String(request?.company_id ?? companies[0]?.id ?? "");
  const [unit, setUnit] = useState(
    String(
      request?.business_unit_id ??
        units.find((u) => u.company_id === company)?.id ??
        "",
    ),
  );
  const [supplier, setSupplier] = useState(String(request?.supplier_id ?? ""));
  const [useSupplierBankAccount, setUseSupplierBankAccount] = useState(
    request?.use_supplier_bank_account !== false,
  );
  const [bank, setBank] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (state.success && state.id)
      router.push(`/finance/payment-control/requests/${state.id}`);
  }, [state, router]);
  useEffect(() => {
    if (supplier)
      supplierBankSummaryAction(supplier).then((r) =>
        setBank(r.success ? (r.data as Record<string, unknown>) : null),
      );
  }, [supplier]);
  const error = (name: string) => state.fieldErrors?.[name]?.[0];
  const input =
    "mt-1.5 w-full rounded-xl border border-[#d8e1dc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#277a55]";
  const visibleUnits = units.filter((u) => u.company_id === company);
  const visibleCategories = categories.filter(
    (x) =>
      x.company_id === company &&
      (!x.business_unit_id || x.business_unit_id === unit),
  );
  const visibleCenters = centers.filter(
    (x) =>
      x.company_id === company &&
      (!x.business_unit_id || x.business_unit_id === unit),
  );
  const currentCenterId = String(request?.cost_center_id ?? "");
  const automaticCenterId = visibleCenters.some((x) => x.id === currentCenterId)
    ? currentCenterId
    : (visibleCenters[0]?.id ?? "");
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={String(request?.id ?? "")} />
      {state.message && (
        <p
          className={`rounded-xl p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
        >
          {state.message}
        </p>
      )}
      <Section title="Contexto">
        <input type="hidden" name="company_id" value={company} />
        <div className="grid gap-4">
          <Field label="Unidad de negocio" error={error("business_unit_id")}>
            <select
              name="business_unit_id"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={input}
              required
            >
              <option value="">Selecciona</option>
              {visibleUnits.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Solicitud">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo" error={error("request_type")}>
            <select
              name="request_type"
              defaultValue={String(request?.request_type ?? "supplier_payment")}
              className={input}
            >
              <option value="supplier_payment">Pago a proveedor</option>
              <option value="reimbursement">Reembolso</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Prioridad" error={error("priority")}>
            <select
              name="priority"
              defaultValue={String(request?.priority ?? "normal")}
              className={input}
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgente</option>
              <option value="scheduled">Programado</option>
            </select>
          </Field>
          <Field label="Fecha de pago" error={error("requested_payment_date")}>
            <input
              type="date"
              name="requested_payment_date"
              defaultValue={String(request?.requested_payment_date ?? "")}
              className={input}
            />
          </Field>
        </div>
      </Section>
      <Section title="Proveedor y monto">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Proveedor" error={error("supplier_id")}>
            <select
              name="supplier_id"
              value={supplier}
              onChange={(e) => {
                setBank(null);
                setSupplier(e.target.value);
              }}
              className={input}
              required
            >
              <option value="">Buscar y seleccionar</option>
              {suppliers
                .filter((x) => x.company_id === company)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.legal_name} · {x.rut}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="RUT del proveedor">
            <input
              value={
                suppliers.find((x) => x.id === supplier)?.rut ??
                String(request?.supplier_rut ?? "")
              }
              readOnly
              className={`${input} bg-slate-50`}
              aria-label="RUT autocompletado"
            />
          </Field>
          <Field
            label="Destino del pago"
            error={error("use_supplier_bank_account")}
          >
            <div className="mt-1.5 grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-xl border bg-white p-4 text-sm">
                <input
                  type="radio"
                  name="use_supplier_bank_account"
                  value="true"
                  checked={useSupplierBankAccount}
                  onChange={() => setUseSupplierBankAccount(true)}
                />
                <span>
                  <b>Usar cuenta bancaria del proveedor</b>
                  <small className="mt-1 block text-slate-500">
                    Finanzas utilizará la cuenta registrada en su ficha.
                  </small>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-xl border bg-white p-4 text-sm">
                <input
                  type="radio"
                  name="use_supplier_bank_account"
                  value="false"
                  checked={!useSupplierBankAccount}
                  onChange={() => setUseSupplierBankAccount(false)}
                />
                <span>
                  <b>No usar cuenta bancaria del proveedor</b>
                  <small className="mt-1 block text-slate-500">
                    Para pagos en efectivo u otra modalidad gestionada por el
                    encargado.
                  </small>
                </span>
              </label>
            </div>
          </Field>
          <div className="md:col-span-2 rounded-xl border bg-slate-50 p-4 text-sm">
            {!useSupplierBankAccount ? (
              <p className="text-amber-800">
                Esta solicitud se enviará sin datos bancarios del proveedor.
                Finanzas deberá registrar el medio real utilizado al pagar.
              </p>
            ) : !supplier ? (
              <span>Selecciona un proveedor para consultar su cuenta bancaria.</span>
            ) : bank?.available ? (
              <>
                <b>{String(bank.bank_name)} · {String(bank.account_type)}</b>
                <p>{String(bank.masked_number)} · {String(bank.account_holder_name)}</p>
                <p className="text-emerald-700">Cuenta bancaria disponible</p>
              </>
            ) : (
              <p className="text-red-700">
                Este proveedor no tiene una cuenta bancaria disponible. Corrige
                su ficha o selecciona “No usar cuenta bancaria del proveedor”.
              </p>
            )}
          </div>
          <Field label="Monto CLP" error={error("amount")}>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              defaultValue={String(request?.amount ?? "")}
              className={input}
              required
            />
          </Field>
          <Field label="Moneda">
            <input value="CLP" readOnly className={`${input} bg-slate-50`} />
          </Field>
        </div>
      </Section>
      <Section title="Clasificación">
        <input type="hidden" name="cost_center_id" value={automaticCenterId} />
        <div className="grid gap-4">
          <Field label="Categoría" error={error("expense_category_id")}>
            <select
              name="expense_category_id"
              defaultValue={String(request?.expense_category_id ?? "")}
              className={input}
              required
            >
              <option value="">Selecciona</option>
              {visibleCategories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {!visibleCategories.length && (
              <span className="mt-1 block text-xs text-amber-700">
                No hay categorías activas disponibles para este alcance.
              </span>
            )}
          </Field>
          {!automaticCenterId && (
            <p className="text-sm text-amber-700">
              No existe un centro de costo activo para esta unidad. Solicita su
              configuración a un administrador.
            </p>
          )}
          {error("cost_center_id") && (
            <p className="text-xs text-red-600">{error("cost_center_id")}</p>
          )}
        </div>
      </Section>
      <Section title="Detalle">
        <Field label="Descripción o motivo" error={error("description")}>
          <textarea
            name="description"
            defaultValue={String(request?.description ?? "")}
            className={`${input} min-h-28`}
            required
          />
        </Field>
      </Section>
      <Section title="Respaldos">
        <input
          name="attachments"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          className={input}
        />
        <p className="mt-2 text-xs text-slate-500">
          PDF, JPG, JPEG o PNG. Máximo 10 MB por archivo y 4 archivos por vez.
        </p>
        {error("attachments") && (
          <p className="text-xs text-red-600">{error("attachments")}</p>
        )}
      </Section>
      <div className="flex justify-end">
        <button
          disabled={pending}
          className="rounded-xl bg-[#173f2d] px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </form>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dce4df] bg-white p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-[#33483d]">
      {label}
      {children}
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}
