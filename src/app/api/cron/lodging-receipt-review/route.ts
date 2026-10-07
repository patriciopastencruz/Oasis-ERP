import { timingSafeEqual } from "node:crypto";
import { reviewPendingPaymentReceipts } from "@/modules/lodging/application/receipt-ai-review";

export const maxDuration = 60;

function valid(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const value =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Red de seguridad de la revisión con IA: reintenta los comprobantes que
// quedaron pendientes (subidos antes de la función, cortados a mitad de
// camino o con error) para que el informe ya muestre el resultado.
export async function GET(request: Request) {
  if (!valid(request))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const result = await reviewPendingPaymentReceipts({
    limit: 40,
    concurrency: 5,
  });
  return Response.json({ ok: true, ...result });
}
