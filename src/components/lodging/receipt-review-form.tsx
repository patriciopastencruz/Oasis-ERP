import { reviewReceiptsAction } from "@/modules/lodging/application/receipt-review-actions";
import { REVIEW_OUTCOME_LABELS } from "@/modules/lodging/domain/receipt-manual-review";

/** Formulario para dejar constancia de la revisión manual: resultado y comentario obligatorios. */
export function ReceiptReviewForm({
  reservationId,
  back,
  label = "Registrar revisión",
  open = false,
}: {
  reservationId: string;
  back: string;
  label?: string;
  open?: boolean;
}) {
  return (
    <details open={open} className="mt-1 text-xs">
      <summary className="cursor-pointer font-semibold text-[#0b4f9c]">{label}</summary>
      <form action={reviewReceiptsAction} className="mt-2 w-64 space-y-2 rounded-lg border bg-white p-2">
        <input type="hidden" name="reservation_id" value={reservationId} />
        <input type="hidden" name="back" value={back} />
        <select name="outcome" required defaultValue="ok" className="w-full rounded-md border px-2 py-1.5">
          {Object.entries(REVIEW_OUTCOME_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        <textarea
          name="comment"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Qué revisaste (monto, fecha, destinatario…) y qué encontraste"
          className="w-full rounded-md border px-2 py-1.5"
        />
        <button className="w-full rounded-md bg-[#0b4f9c] px-3 py-1.5 font-semibold text-white">Guardar revisión</button>
      </form>
    </details>
  );
}
