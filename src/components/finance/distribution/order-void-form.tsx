"use client";
import { useState } from "react";
import {
  requestOrderChangeAction,
  voidOrderAction,
} from "@/modules/finance/distribution/application/actions";
import { inputClass } from "./module-nav";

export function OrderVoidForm({
  mode,
  orderId,
}: {
  mode: "void" | "request";
  orderId: string;
}) {
  const [open, setOpen] = useState(false);
  const action = mode === "void" ? voidOrderAction : requestOrderChangeAction;

  if (!open)
    return (
      <button
        type="button"
        className="text-xs font-semibold text-red-700"
        onClick={() => setOpen(true)}
      >
        {mode === "void" ? "Anular pedido" : "Solicitar anulación"}
      </button>
    );

  return (
    <form
      action={action}
      className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3"
    >
      <input type="hidden" name="order_id" value={orderId} />
      {mode === "request" && <input type="hidden" name="type" value="void" />}
      <label className="block text-xs font-medium text-red-900">
        Motivo de la anulación
        <textarea
          className={inputClass}
          name="reason"
          rows={2}
          required
          minLength={3}
          placeholder="Explica por qué se anula el pedido."
        />
      </label>
      <div className="flex gap-2">
        <button className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white">
          {mode === "void" ? "Confirmar anulación" : "Enviar solicitud"}
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
