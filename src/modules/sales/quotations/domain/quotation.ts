export const IVA_RATE = 0.19;

export const quotationStatuses = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "delivered",
] as const;
export type QuotationStatus = (typeof quotationStatuses)[number];

export const DEFAULT_QUOTATION_TERMS = `1. Cotización válida por 5 días hábiles. (Todos los abonos realizados no son reembolsables)
2. Monto se expresa en monto neto. Al final se incluye el IVA.
3. Pagos vía transferencia, efectivo, vale vista, tarjeta de débito y crédito con un recargo (3%).
4. Todos nuestros proyectos se inician con un anticipo de 50% del total y el saldo en la entrega del módulo o proyecto (a convenir entre comprador y vendedor).
5. Trabajamos con OC (orden de compra) y/o contrato firmado.`;

export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
